from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_APIFY_GOOGLE_ACTORS = "apify/google-search-scraper"
DEFAULT_APIFY_X_ACTORS = "apidojo/twitter-scraper-lite,apidojo/tweet-scraper,scrapier/twitter-x-tweets-scraper"
DEFAULT_APIFY_TIKTOK_ACTOR = "clockworks/tiktok-comments-scraper"
DEFAULT_APIFY_REDDIT_ACTOR = "trudax/reddit-scraper-lite"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_HTTP_RETRIES = 2
DEFAULT_MAX_ITEMS = 6
SOURCE_TYPES = ("x", "youtube", "reddit", "news", "google", "tiktok")
BRIEFING_SOURCE_PRIORITY = ("news", "google", "x", "youtube", "reddit", "tiktok")
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "will",
    "with",
}


@dataclass
class MarketResearchInput:
    question: str
    market_id: str = ""
    url: str = ""
    resolution_date: str = ""
    market_context: str = ""
    resolution_criteria: str = ""
    x_post_url: str = ""
    seed_queries: list[str] = field(default_factory=list)

    @classmethod
    def from_json_file(cls, path: Path) -> "MarketResearchInput":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            question=_require_string(payload.get("question"), "question"),
            market_id=_optional_string(payload.get("market_id")),
            url=_optional_string(payload.get("url")),
            resolution_date=_optional_string(payload.get("resolution_date")),
            market_context=_optional_string(payload.get("market_context")),
            resolution_criteria=_optional_string(payload.get("resolution_criteria")),
            x_post_url=_optional_string(payload.get("x_post_url")),
            seed_queries=[str(item).strip() for item in payload.get("seed_queries", []) if str(item).strip()],
        )

    def build_queries(self) -> list[str]:
        queries: list[str] = []

        for seed_query in self.seed_queries:
            cleaned = normalize_space(seed_query)
            if cleaned:
                queries.append(cleaned)

        base_question = normalize_space(self.question.rstrip("?"))
        if base_question and len(queries) < 2:
            queries.append(base_question)

        if not queries:
            keyword_query = build_keyword_query(" ".join(filter(None, [self.question, self.market_context, self.resolution_criteria])))
            if keyword_query:
                queries.append(keyword_query)

        return dedupe_strings(queries)[:6]


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.use_system_proxy:
        os.environ["SCRAPER_USE_SYSTEM_PROXY"] = "1"
    if args.disable_apify:
        args.apify_token = ""

    market_input = resolve_market_input(args)
    queries = dedupe_strings([*market_input.build_queries(), *args.query])
    if not queries:
        parser.error("At least one query is required. Provide --query or a market input file/question.")

    include_sources = {
        "x": not args.disable_x,
        "youtube": not args.disable_youtube,
        "reddit": not args.disable_reddit,
        "news": not args.disable_news,
        "google": not args.disable_google,
        "tiktok": not args.disable_tiktok,
    }

    dossier = build_research_dossier(
        market_input=market_input,
        queries=queries,
        max_items_per_source=args.max_items_per_source,
        include_sources=include_sources,
        apify_token=args.apify_token,
        youtube_api_key=args.youtube_api_key,
        apify_google_actors=parse_csv_actors(args.apify_google_actors),
        apify_x_actors=parse_csv_actors(args.apify_x_actors),
        apify_tiktok_actor=normalize_space(args.apify_tiktok_actor),
        apify_reddit_actor=normalize_space(args.apify_reddit_actor),
        lava_api_key=args.lava_api_key,
        lava_x_endpoint=normalize_space(args.lava_x_endpoint) or "https://api.lava.so/v1/x/search",
        http_timeout_seconds=max(5, int(args.http_timeout_seconds)),
        http_retries=max(0, int(args.http_retries)),
        include_raw=args.include_raw,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dossier, indent=2) + "\n", encoding="utf-8")

    print(f"Research dossier saved to {output_path}")
    print("Source counts: " + ", ".join(f"{source}={dossier['source_counts'].get(source, 0)}" for source in SOURCE_TYPES))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m signalmarket_scrapers",
        description="Collect cross-platform evidence for a prediction market and write a normalized research dossier JSON.",
    )
    parser.add_argument("--market-research-file", help="JSON file with question/context/queries for the market.")
    parser.add_argument("--market-state-file", help="Existing market_state JSON. Used when a richer research file is not provided.")
    parser.add_argument("--market-question", help="Override market question.")
    parser.add_argument("--market-id", default="", help="Optional market id.")
    parser.add_argument("--market-url", default="", help="Optional market URL.")
    parser.add_argument("--resolution-date", default="", help="Optional ISO resolution date.")
    parser.add_argument("--market-context", default="", help="Optional extra market context paragraph.")
    parser.add_argument("--resolution-criteria", default="", help="Optional resolver/rules text.")
    parser.add_argument("--x-post-url", default="", help="Optional original X post URL to preserve in the dossier.")
    parser.add_argument("--query", action="append", default=[], help="Extra query. Repeat to add multiple.")
    parser.add_argument("--output", required=True, help="Path for the output dossier JSON.")
    parser.add_argument("--max-items-per-source", type=int, default=DEFAULT_MAX_ITEMS, help="Items to keep per source.")
    parser.add_argument("--include-raw", action="store_true", help="Keep larger raw payload fragments on each record.")
    parser.add_argument("--disable-x", action="store_true", help="Skip X collection.")
    parser.add_argument("--disable-youtube", action="store_true", help="Skip YouTube collection.")
    parser.add_argument("--disable-reddit", action="store_true", help="Skip Reddit collection.")
    parser.add_argument("--disable-news", action="store_true", help="Skip Google News RSS collection.")
    parser.add_argument("--disable-google", action="store_true", help="Skip Google web search collection.")
    parser.add_argument("--disable-tiktok", action="store_true", help="Skip TikTok comments collection.")
    parser.add_argument("--apify-token", default=read_env("APIFY_API_TOKEN"), help="Apify token for X + Google scraping.")
    parser.add_argument("--youtube-api-key", default=read_env("YOUTUBE_API_KEY"), help="YouTube Data API key.")
    parser.add_argument(
        "--apify-google-actors",
        default=read_env("APIFY_GOOGLE_ACTOR_IDS") or read_env("APIFY_GOOGLE_ACTOR_ID") or DEFAULT_APIFY_GOOGLE_ACTORS,
        help="Comma-separated Apify actors for Google search fallback chain.",
    )
    parser.add_argument(
        "--apify-x-actors",
        default=read_env("APIFY_X_ACTOR_IDS") or read_env("APIFY_X_ACTOR_ID") or DEFAULT_APIFY_X_ACTORS,
        help="Comma-separated Apify actors for X scraping fallback chain.",
    )
    parser.add_argument(
        "--apify-tiktok-actor",
        default=read_env("APIFY_TIKTOK_ACTOR_ID") or DEFAULT_APIFY_TIKTOK_ACTOR,
        help="Apify actor id for TikTok comments enrichment.",
    )
    parser.add_argument(
        "--apify-reddit-actor",
        default=read_env("APIFY_REDDIT_ACTOR_ID") or DEFAULT_APIFY_REDDIT_ACTOR,
        help="Optional Apify actor id for Reddit scraping before public-API fallback.",
    )
    parser.add_argument("--lava-api-key", default=read_env("LAVA_API_KEY"), help="Optional Lava API key for X fallback.")
    parser.add_argument("--lava-x-endpoint", default=read_env("LAVA_X_ENDPOINT") or "https://api.lava.so/v1/x/search")
    parser.add_argument("--http-timeout-seconds", type=int, default=read_env_int("SCRAPER_HTTP_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    parser.add_argument("--http-retries", type=int, default=read_env_int("SCRAPER_HTTP_RETRIES", DEFAULT_HTTP_RETRIES))
    parser.add_argument("--use-system-proxy", action="store_true", help="Use system HTTP proxy settings instead of direct outbound connections.")
    parser.add_argument(
        "--disable-apify",
        action="store_true",
        default=read_env_bool("SCRAPER_DISABLE_APIFY", False),
        help="Disable Apify actor calls and rely on direct web/RSS fallbacks.",
    )
    return parser


def resolve_market_input(args: argparse.Namespace) -> MarketResearchInput:
    market_input: MarketResearchInput | None = None

    if args.market_research_file:
        market_input = MarketResearchInput.from_json_file(Path(args.market_research_file))
    elif args.market_state_file:
        payload = json.loads(Path(args.market_state_file).read_text(encoding="utf-8"))
        market_input = MarketResearchInput(
            question=_require_string(payload.get("question"), "question"),
            market_id=_optional_string(payload.get("market_id")),
            url=_optional_string(payload.get("url")),
            resolution_date=_optional_string(payload.get("resolution_date")),
        )

    if market_input is None:
        if not args.market_question:
            raise SystemExit("Missing market input. Use --market-research-file, --market-state-file, or --market-question.")
        market_input = MarketResearchInput(question=args.market_question)

    if args.market_question:
        market_input.question = args.market_question
    if args.market_id:
        market_input.market_id = args.market_id
    if args.market_url:
        market_input.url = args.market_url
    if args.resolution_date:
        market_input.resolution_date = args.resolution_date
    if args.market_context:
        market_input.market_context = args.market_context
    if args.resolution_criteria:
        market_input.resolution_criteria = args.resolution_criteria
    if args.x_post_url:
        market_input.x_post_url = args.x_post_url

    return market_input


def build_research_dossier(
    *,
    market_input: MarketResearchInput,
    queries: list[str],
    max_items_per_source: int,
    include_sources: dict[str, bool],
    apify_token: str,
    youtube_api_key: str,
    apify_google_actors: list[str],
    apify_x_actors: list[str],
    apify_tiktok_actor: str,
    apify_reddit_actor: str,
    lava_api_key: str,
    lava_x_endpoint: str,
    http_timeout_seconds: int,
    http_retries: int,
    include_raw: bool,
) -> dict[str, Any]:
    keyword_set = keyword_tokens(" ".join([market_input.question, market_input.market_context, market_input.resolution_criteria, *queries]))
    source_records: list[dict[str, Any]] = []
    collection_errors: list[dict[str, str]] = []

    primary_x_seed = build_primary_x_seed_record(market_input=market_input, queries=queries, keyword_set=keyword_set)
    if primary_x_seed:
        source_records.append(primary_x_seed)

    def collect_safe(source_type: str, collector: Any) -> None:
        try:
            source_records.extend(collector())
        except Exception as exc:  # noqa: BLE001
            collection_errors.append(
                {
                    "source_type": source_type,
                    "error": trim_to_length(str(exc), 280),
                }
            )

    if include_sources["x"]:
        collect_safe(
            "x",
            lambda: collect_x_results(
                queries=queries,
                market_input=market_input,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                apify_token=apify_token,
                actor_ids=apify_x_actors,
                lava_api_key=lava_api_key,
                lava_x_endpoint=lava_x_endpoint,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    if include_sources["youtube"]:
        collect_safe(
            "youtube",
            lambda: collect_youtube_results(
                queries=queries,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                youtube_api_key=youtube_api_key,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    if include_sources["reddit"]:
        collect_safe(
            "reddit",
            lambda: collect_reddit_results(
                queries=queries,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                apify_token=apify_token,
                actor_id=apify_reddit_actor,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    if include_sources["news"]:
        collect_safe(
            "news",
            lambda: collect_google_news_results(
                queries=queries,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    if include_sources["google"]:
        collect_safe(
            "google",
            lambda: collect_google_results(
                queries=queries,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                apify_token=apify_token,
                actor_ids=apify_google_actors,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    if include_sources["tiktok"]:
        collect_safe(
            "tiktok",
            lambda: collect_tiktok_results(
                queries=queries,
                keyword_set=keyword_set,
                limit=max_items_per_source,
                apify_token=apify_token,
                actor_id=apify_tiktok_actor,
                timeout_seconds=http_timeout_seconds,
                retries=http_retries,
                include_raw=include_raw,
            ),
        )

    source_records.extend(
        collect_social_reference_records(
            records=source_records,
            queries=queries,
            keyword_set=keyword_set,
            include_raw=include_raw,
        )
    )

    if include_sources.get("x", False) and not any(record.get("source_type") == "x" for record in source_records):
        source_records.append(
            build_seed_search_record(source_type="x", query=queries[0] if queries else market_input.question, keyword_set=keyword_set)
        )
    if include_sources.get("google", False) and not any(record.get("source_type") == "google" for record in source_records):
        source_records.append(
            build_seed_search_record(source_type="google", query=queries[0] if queries else market_input.question, keyword_set=keyword_set)
        )
    if include_sources.get("tiktok", False) and not any(record.get("source_type") == "tiktok" for record in source_records):
        source_records.append(
            build_seed_search_record(source_type="tiktok", query=queries[0] if queries else market_input.question, keyword_set=keyword_set)
        )

    deduped_sources = dedupe_records(source_records)
    source_counts = {source_type: 0 for source_type in SOURCE_TYPES}
    for record in deduped_sources:
        source_counts[record["source_type"]] += 1

    briefing_lines = build_briefing_lines(deduped_sources)
    report_id = f"{slugify(market_input.market_id or market_input.question)}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

    return {
        "report_id": report_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market": {
            "market_id": market_input.market_id,
            "question": market_input.question,
            "url": market_input.url,
            "resolution_date": market_input.resolution_date,
            "market_context": market_input.market_context,
            "resolution_criteria": market_input.resolution_criteria,
            "queries": queries,
            "x_post_url": market_input.x_post_url,
        },
        "briefing_lines": briefing_lines,
        "source_counts": source_counts,
        "sources": deduped_sources,
        "collection_errors": collection_errors,
    }


def collect_x_results(
    *,
    queries: list[str],
    market_input: MarketResearchInput,
    keyword_set: set[str],
    limit: int,
    apify_token: str,
    actor_ids: list[str],
    lava_api_key: str,
    lava_x_endpoint: str,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    actor_input = {"startUrls": dedupe_strings([market_input.x_post_url, *queries]), "maxTweets": limit}
    payload: list[dict[str, Any]] = []
    actor_errors: list[str] = []

    if apify_token and actor_ids:
        for actor_id in actor_ids:
            try:
                candidate_payload = run_apify_actor(
                    actor_id=actor_id,
                    apify_token=apify_token,
                    actor_input=actor_input,
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                )
                if is_usable_x_payload(candidate_payload):
                    payload.extend(candidate_payload)
                    if len(payload) >= limit * max(2, len(queries)):
                        break
                else:
                    actor_errors.append(f"{actor_id}: returned demo/empty payload")
            except Exception as exc:  # noqa: BLE001
                actor_errors.append(f"{actor_id}: {trim_to_length(str(exc), 160)}")

    if not payload and lava_api_key:
        try:
            payload.extend(
                run_lava_x_fallback(
                    lava_api_key=lava_api_key,
                    lava_x_endpoint=lava_x_endpoint,
                    queries=queries,
                    x_post_url=market_input.x_post_url,
                    limit=limit,
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                )
            )
        except Exception as exc:  # noqa: BLE001
            actor_errors.append(f"lava: {trim_to_length(str(exc), 160)}")

    web_fallback_records: list[dict[str, Any]] = []
    try:
        web_fallback_records = collect_x_results_via_web_search(
            queries=queries,
            keyword_set=keyword_set,
            limit=limit,
            timeout_seconds=timeout_seconds,
            retries=retries,
            include_raw=include_raw,
        )
    except Exception as exc:  # noqa: BLE001
        actor_errors.append(f"x-web-fallback: {trim_to_length(str(exc), 160)}")

    if not payload and not web_fallback_records and actor_errors:
        raise RuntimeError("X collection failed across providers: " + " | ".join(actor_errors))

    records: list[dict[str, Any]] = []
    for item in payload[: limit * max(1, len(queries))]:
        text = first_present(item, ["fullText", "text", "tweetText", "tweet", "content", "tweetContent"])
        url = first_present(item, ["url", "tweetUrl", "permanentUrl", "tweetLink", "link"])
        title = text or first_present(item, ["title"]) or "X post"
        query = infer_matching_query(title + " " + text, queries)
        record = build_source_record(
            source_type="x",
            provider=detect_x_provider(item),
            query=query,
            title=title,
            url=url or market_input.x_post_url or "",
            author=first_present(item, ["authorName", "username", "screenName", "authorUsername"]),
            published_at=first_present(item, ["createdAt", "timestamp"]),
            snippet=text,
            raw_text=" ".join(filter(None, [title, text])),
            keyword_set=keyword_set,
            engagement={
                "likes": to_non_negative_number(first_present(item, ["likeCount", "likes"])),
                "retweets": to_non_negative_number(first_present(item, ["retweetCount", "retweets"])),
                "replies": to_non_negative_number(first_present(item, ["replyCount", "replies"])),
            },
            raw=item if include_raw else None,
        )
        if record:
            records.append(record)

    return limit_per_source([*records, *web_fallback_records], limit)


def collect_youtube_results(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    youtube_api_key: str,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if youtube_api_key:
        try:
            for query in queries[:3]:
                search_payload = fetch_json(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "key": youtube_api_key,
                        "part": "snippet",
                        "type": "video",
                        "q": query,
                        "maxResults": str(limit),
                        "order": "relevance",
                    },
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                )
                video_ids = [item.get("id", {}).get("videoId") for item in search_payload.get("items", []) if item.get("id", {}).get("videoId")]
                if not video_ids:
                    continue

                stats_payload = fetch_json(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={
                        "key": youtube_api_key,
                        "part": "snippet,statistics",
                        "id": ",".join(video_ids),
                    },
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                )
                stats_by_id = {item.get("id"): item for item in stats_payload.get("items", [])}
                for video_id in video_ids:
                    item = stats_by_id.get(video_id, {})
                    snippet = item.get("snippet", {})
                    statistics = item.get("statistics", {})
                    title = normalize_space(snippet.get("title", ""))
                    description = normalize_space(snippet.get("description", ""))
                    record = build_source_record(
                        source_type="youtube",
                        provider="youtube-data-api-v3",
                        query=query,
                        title=title or f"YouTube video {video_id}",
                        url=f"https://www.youtube.com/watch?v={video_id}",
                        author=snippet.get("channelTitle", ""),
                        published_at=snippet.get("publishedAt", ""),
                        snippet=description,
                        raw_text=" ".join(filter(None, [title, description])),
                        keyword_set=keyword_set,
                        engagement={
                            "views": to_non_negative_number(statistics.get("viewCount")),
                            "likes": to_non_negative_number(statistics.get("likeCount")),
                            "comments": to_non_negative_number(statistics.get("commentCount")),
                        },
                        raw=item if include_raw else None,
                    )
                    if record:
                        records.append(record)
        except Exception:
            # Fail open to web fallback.
            records = []

    if records:
        return limit_per_source(records, limit)

    # Fallback when API key is missing/invalid or quota-limited.
    for query in queries[:3]:
        for hit in collect_web_search_hits(query=f"site:youtube.com {query}", limit=limit, timeout_seconds=timeout_seconds, retries=retries):
            if "youtube.com" not in hit["url"].lower():
                continue
            record = build_source_record(
                source_type="youtube",
                provider="youtube-web-fallback",
                query=query,
                title=hit["title"] or "YouTube discussion",
                url=hit["url"],
                author="",
                published_at="",
                snippet=hit["snippet"],
                raw_text=" ".join(filter(None, [hit["title"], hit["snippet"]])),
                keyword_set=keyword_set,
                engagement={"position": to_non_negative_number(hit["position"])},
                raw=hit if include_raw else None,
            )
            if record:
                records.append(record)
    return limit_per_source(records, limit)


def collect_reddit_results(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    apify_token: str,
    actor_id: str,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    if apify_token and actor_id:
        try:
            actor_records = collect_reddit_results_from_apify(
                queries=queries,
                keyword_set=keyword_set,
                limit=limit,
                apify_token=apify_token,
                actor_id=actor_id,
                timeout_seconds=timeout_seconds,
                retries=retries,
                include_raw=include_raw,
            )
            if actor_records:
                return actor_records
        except Exception:
            # Fall back to public Reddit search path on any actor-level issue.
            pass

    records: list[dict[str, Any]] = []
    headers = {"User-Agent": "SignalMarketResearchBot/0.1"}
    for query in queries[:3]:
        payload = fetch_json(
            "https://www.reddit.com/search.json",
            params={"q": query, "sort": "relevance", "limit": str(limit), "raw_json": "1", "type": "link"},
            headers=headers,
            timeout_seconds=timeout_seconds,
            retries=retries,
        )
        children = payload.get("data", {}).get("children", [])
        for child in children:
            item = child.get("data", {})
            title = normalize_space(item.get("title", ""))
            body = normalize_space(item.get("selftext", ""))
            permalink = item.get("permalink", "")
            record = build_source_record(
                source_type="reddit",
                provider="reddit-public-json",
                query=query,
                title=title or "Reddit post",
                url=f"https://www.reddit.com{permalink}" if permalink else "",
                author=item.get("author", ""),
                published_at=utc_from_unix(item.get("created_utc")),
                snippet=body or normalize_space(item.get("url_overridden_by_dest", "")),
                raw_text=" ".join(filter(None, [title, body])),
                keyword_set=keyword_set,
                engagement={
                    "score": to_non_negative_number(item.get("score")),
                    "comments": to_non_negative_number(item.get("num_comments")),
                },
                raw=item if include_raw else None,
            )
            if record:
                records.append(record)
    return limit_per_source(records, limit)


def collect_google_news_results(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for query in queries[:3]:
        records.extend(
            collect_google_news_rss_query(
                query=query,
                rss_query=query,
                keyword_set=keyword_set,
                limit=limit,
                timeout_seconds=timeout_seconds,
                retries=retries,
                include_raw=include_raw,
                provider_label="google-news-rss",
            )
        )
        records.extend(
            collect_google_news_rss_query(
                query=query,
                rss_query=f"{query} (site:medium.com OR site:substack.com)",
                keyword_set=keyword_set,
                limit=max(2, limit // 2),
                timeout_seconds=timeout_seconds,
                retries=retries,
                include_raw=include_raw,
                provider_label="google-news-rss-longform",
            )
        )
    return limit_per_source(records, limit)


def collect_google_news_rss_query(
    *,
    query: str,
    rss_query: str,
    keyword_set: set[str],
    limit: int,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
    provider_label: str,
    source_type: str = "news",
) -> list[dict[str, Any]]:
    encoded_query = urllib.parse.quote_plus(rss_query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    xml_text = fetch_text(url, timeout_seconds=timeout_seconds, retries=retries)
    root = ET.fromstring(xml_text)
    records: list[dict[str, Any]] = []
    for item in root.findall("./channel/item")[:limit]:
        title = normalize_space(item.findtext("title", default=""))
        description = strip_html(item.findtext("description", default=""))
        source = normalize_space(item.findtext("source", default=""))
        link = normalize_space(item.findtext("link", default=""))
        provider = provider_label
        link_lower = link.lower()
        if "medium.com" in link_lower:
            provider = "medium-rss"
        elif "substack.com" in link_lower:
            provider = "substack-rss"

        record = build_source_record(
            source_type=source_type,
            provider=provider,
            query=query,
            title=title or "Google News item",
            url=link,
            author=source,
            published_at=normalize_space(item.findtext("pubDate", default="")),
            snippet=description,
            raw_text=" ".join(filter(None, [title, description])),
            keyword_set=keyword_set,
            engagement={},
            raw={"rss": ET.tostring(item, encoding="unicode")} if include_raw else None,
        )
        if record:
            records.append(record)
    return records


def collect_google_results(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    apify_token: str,
    actor_ids: list[str],
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    actor_input = {
        "queries": "\n".join(queries[:3]),
        "resultsPerPage": limit,
        "maxPagesPerQuery": 1,
    }
    payload: list[dict[str, Any]] = []
    errors: list[str] = []

    if apify_token and actor_ids:
        for actor_id in actor_ids:
            try:
                candidate_payload = run_apify_actor(
                    actor_id=actor_id,
                    apify_token=apify_token,
                    actor_input=actor_input,
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                )
                if candidate_payload:
                    payload.extend(candidate_payload)
                    if len(payload) >= limit * max(2, len(queries)):
                        break
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{actor_id}: {trim_to_length(str(exc), 160)}")

    web_fallback_records: list[dict[str, Any]] = []
    try:
        web_fallback_records = collect_google_results_via_web_search(
            queries=queries,
            keyword_set=keyword_set,
            limit=limit,
            timeout_seconds=timeout_seconds,
            retries=retries,
            include_raw=include_raw,
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"google-web-fallback: {trim_to_length(str(exc), 160)}")

    if not payload and not web_fallback_records and errors:
        raise RuntimeError("Google actor chain failed: " + " | ".join(errors))

    records: list[dict[str, Any]] = []
    for item in payload:
        organic_results = item.get("organicResults") or item.get("results") or []
        query = normalize_space(item.get("searchQuery", "")) or infer_matching_query(json.dumps(item), queries)
        for organic in organic_results[:limit]:
            title = normalize_space(organic.get("title", ""))
            snippet = normalize_space(organic.get("description", "") or organic.get("snippet", ""))
            record = build_source_record(
                source_type="google",
                provider=detect_google_provider(item, actor_ids),
                query=query,
                title=title or "Google result",
                url=normalize_space(organic.get("url", "") or organic.get("link", "")),
                author=normalize_space(organic.get("displayedUrl", "")),
                published_at="",
                snippet=snippet,
                raw_text=" ".join(filter(None, [title, snippet])),
                keyword_set=keyword_set,
                engagement={"position": to_non_negative_number(organic.get("position"))},
                raw=organic if include_raw else None,
            )
            if record:
                records.append(record)

    return limit_per_source([*records, *web_fallback_records], limit)


def collect_reddit_results_from_apify(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    apify_token: str,
    actor_id: str,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    payload = run_apify_actor(
        actor_id=actor_id,
        apify_token=apify_token,
        actor_input={"queries": queries[:3], "maxResults": limit},
        timeout_seconds=timeout_seconds,
        retries=retries,
    )

    records: list[dict[str, Any]] = []
    for item in payload[: limit * max(1, len(queries))]:
        title = first_present(item, ["title", "postTitle"])
        body = first_present(item, ["text", "body", "selftext", "postText"])
        permalink = first_present(item, ["permalink", "url", "link"])
        query = infer_matching_query(" ".join([title, body]), queries)
        url = permalink if permalink.startswith("http") else f"https://www.reddit.com{permalink}" if permalink else ""
        record = build_source_record(
            source_type="reddit",
            provider=f"apify/{actor_id}",
            query=query,
            title=title or "Reddit post",
            url=url,
            author=first_present(item, ["author", "authorName", "username"]),
            published_at=first_present(item, ["createdAt", "publishedAt", "timestamp"]),
            snippet=body,
            raw_text=" ".join(filter(None, [title, body])),
            keyword_set=keyword_set,
            engagement={
                "score": to_non_negative_number(first_present(item, ["score", "upvotes"])),
                "comments": to_non_negative_number(first_present(item, ["numComments", "commentCount"])),
            },
            raw=item if include_raw else None,
        )
        if record:
            records.append(record)
    return limit_per_source([*records, *web_fallback_records], limit)


def collect_tiktok_results(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    apify_token: str,
    actor_id: str,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    web_fallback_records: list[dict[str, Any]] = []
    try:
        web_fallback_records = collect_tiktok_via_web_search(
            queries=queries,
            keyword_set=keyword_set,
            limit=limit,
            timeout_seconds=timeout_seconds,
            retries=retries,
            include_raw=include_raw,
        )
    except Exception:
        web_fallback_records = []

    # Avoid hard failures for non-TikTok contexts; this actor is strongest when URL seeds are present.
    if not apify_token or not actor_id:
        return web_fallback_records

    if not any("tiktok.com" in query.lower() for query in queries):
        return web_fallback_records

    try:
        payload = run_apify_actor(
            actor_id=actor_id,
            apify_token=apify_token,
            actor_input={"queries": queries[:3], "maxResults": limit},
            timeout_seconds=timeout_seconds,
            retries=retries,
        )
    except Exception as exc:  # noqa: BLE001
        if "HTTP 400" in str(exc) or "HTTP Error 400" in str(exc):
            return web_fallback_records
        raise

    records: list[dict[str, Any]] = []
    for item in payload[: limit * max(1, len(queries))]:
        comment = first_present(item, ["text", "comment", "body", "commentText"])
        video_url = first_present(item, ["videoUrl", "url", "link"])
        title = first_present(item, ["title", "videoTitle"]) or "TikTok discussion"
        query = infer_matching_query(" ".join([title, comment]), queries)
        record = build_source_record(
            source_type="tiktok",
            provider=f"apify/{actor_id}",
            query=query,
            title=title,
            url=video_url,
            author=first_present(item, ["author", "authorName", "username"]),
            published_at=first_present(item, ["createTimeISO", "createTime", "publishedAt"]),
            snippet=comment,
            raw_text=" ".join(filter(None, [title, comment])),
            keyword_set=keyword_set,
            engagement={
                "likes": to_non_negative_number(first_present(item, ["likeCount", "likes"])),
                "replies": to_non_negative_number(first_present(item, ["replyCount", "replies"])),
            },
            raw=item if include_raw else None,
        )
        if record:
            records.append(record)
    return limit_per_source([*records, *web_fallback_records], limit)


def collect_tiktok_via_web_search(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for query in queries[:3]:
        normalized_query = normalize_web_query(query)
        for hit in collect_web_search_hits(
            query=f"site:tiktok.com {normalized_query}",
            limit=limit,
            timeout_seconds=timeout_seconds,
            retries=retries,
        ):
            if "tiktok.com" not in hit["url"].lower():
                continue
            record = build_source_record(
                source_type="tiktok",
                provider="google-tiktok-fallback",
                query=query,
                title=hit["title"],
                url=hit["url"],
                author="",
                published_at="",
                snippet=hit["snippet"],
                raw_text=" ".join(filter(None, [hit["title"], hit["snippet"]])),
                keyword_set=keyword_set,
                engagement={"position": to_non_negative_number(hit["position"])},
                raw=hit if include_raw else None,
            )
            if record:
                records.append(record)
    if not records:
        for query in queries[:limit]:
            normalized_query = normalize_web_query(query)
            search_url = f"https://www.tiktok.com/search?q={urllib.parse.quote_plus(normalized_query)}"
            record = build_source_record(
                source_type="tiktok",
                provider="tiktok-search-fallback",
                query=query,
                title=f"TikTok search results for: {normalized_query}",
                url=search_url,
                author="tiktok",
                published_at="",
                snippet="Platform search fallback used when comment scraping endpoints are unavailable.",
                raw_text=normalized_query,
                keyword_set=keyword_set,
                engagement={},
                raw={"search_url": search_url} if include_raw else None,
            )
            if record:
                records.append(record)
    return limit_per_source(records, limit)


def collect_google_results_via_web_search(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for query in queries[:3]:
        normalized_query = normalize_web_query(query)
        for hit in collect_web_search_hits(query=normalized_query, limit=limit, timeout_seconds=timeout_seconds, retries=retries):
            record = build_source_record(
                source_type="google",
                provider="google-web-fallback",
                query=query,
                title=hit["title"],
                url=hit["url"],
                author="google-web",
                published_at="",
                snippet=hit["snippet"],
                raw_text=" ".join(filter(None, [hit["title"], hit["snippet"]])),
                keyword_set=keyword_set,
                engagement={"position": to_non_negative_number(hit["position"])},
                raw=hit if include_raw else None,
            )
            if record:
                records.append(record)

    if not records:
        for query in queries[:3]:
            records.extend(
                collect_google_news_rss_query(
                    query=query,
                    rss_query=query,
                    keyword_set=keyword_set,
                    limit=limit,
                    timeout_seconds=timeout_seconds,
                    retries=retries,
                    include_raw=include_raw,
                    provider_label="google-news-fallback",
                    source_type="google",
                )
            )
    return limit_per_source(records, limit)


def collect_x_results_via_web_search(
    *,
    queries: list[str],
    keyword_set: set[str],
    limit: int,
    timeout_seconds: int,
    retries: int,
    include_raw: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for query in queries[:3]:
        normalized_query = normalize_web_query(query)
        for hit in collect_web_search_hits(
            query=f"(site:x.com OR site:twitter.com) {normalized_query}",
            limit=limit,
            timeout_seconds=timeout_seconds,
            retries=retries,
        ):
            url_lower = hit["url"].lower()
            if "x.com/" not in url_lower and "twitter.com/" not in url_lower:
                continue
            record = build_source_record(
                source_type="x",
                provider="x-web-fallback",
                query=query,
                title=hit["title"] or "X post",
                url=hit["url"],
                author="",
                published_at="",
                snippet=hit["snippet"],
                raw_text=" ".join(filter(None, [hit["title"], hit["snippet"]])),
                keyword_set=keyword_set,
                engagement={"position": to_non_negative_number(hit["position"])},
                raw=hit if include_raw else None,
            )
            if record:
                records.append(record)
    if not records:
        for query in queries[:limit]:
            normalized_query = normalize_web_query(query)
            search_url = f"https://x.com/search?q={urllib.parse.quote_plus(normalized_query)}&src=typed_query&f=live"
            record = build_source_record(
                source_type="x",
                provider="x-search-fallback",
                query=query,
                title=f"X search results for: {normalized_query}",
                url=search_url,
                author="x",
                published_at="",
                snippet="Platform search fallback used when direct X scraping providers are unavailable.",
                raw_text=normalized_query,
                keyword_set=keyword_set,
                engagement={},
                raw={"search_url": search_url} if include_raw else None,
            )
            if record:
                records.append(record)
    return limit_per_source(records, limit)


def parse_google_result_hits(html: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    # Lightweight parser for standard Google SERP links.
    for match in re.finditer(r'<a href="/url\\?q=([^"&]+)[^"]*".*?<h3[^>]*>(.*?)</h3>', html, flags=re.IGNORECASE | re.DOTALL):
        decoded_url = urllib.parse.unquote(match.group(1))
        title_html = match.group(2)
        title = strip_html(title_html)
        if not decoded_url.startswith("http"):
            continue
        if not title:
            continue
        hits.append(
            {
                "url": decoded_url,
                "title": title,
                "snippet": "",
                "position": len(hits) + 1,
            }
        )
    return hits


def collect_web_search_hits(
    *,
    query: str,
    limit: int,
    timeout_seconds: int,
    retries: int,
) -> list[dict[str, Any]]:
    encoded_query = urllib.parse.quote_plus(query)

    # Prefer Bing RSS because it's stable and easy to parse without API keys.
    bing_rss = fetch_text(
        f"https://www.bing.com/search?q={encoded_query}&format=rss",
        timeout_seconds=timeout_seconds,
        retries=retries,
    )
    hits = parse_bing_rss_hits(bing_rss)
    if hits:
        return hits[:limit]

    # Fall back to Google SERP parsing.
    google_html = fetch_text(
        f"https://www.google.com/search?q={encoded_query}&num={max(5, limit)}&hl=en",
        timeout_seconds=timeout_seconds,
        retries=retries,
    )
    return parse_google_result_hits(google_html)[:limit]


def normalize_web_query(query: str) -> str:
    cleaned = normalize_space(re.sub(r'["“”]+', " ", query))
    if not cleaned:
        return query
    tokens = cleaned.split()
    if len(tokens) > 8:
        return " ".join(tokens[:8])
    return cleaned


def parse_bing_rss_hits(xml_text: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return hits
    for item in root.findall("./channel/item"):
        title = normalize_space(item.findtext("title", default=""))
        link = normalize_space(item.findtext("link", default=""))
        snippet = strip_html(item.findtext("description", default=""))
        if not link.startswith("http"):
            continue
        if not title:
            continue
        hits.append({"url": link, "title": title, "snippet": snippet, "position": len(hits) + 1})
    return hits


def build_primary_x_seed_record(
    *,
    market_input: MarketResearchInput,
    queries: list[str],
    keyword_set: set[str],
) -> dict[str, Any] | None:
    x_url = normalize_space(market_input.x_post_url)
    if not x_url:
        return None
    return build_source_record(
        source_type="x",
        provider="seed-post-context",
        query=queries[0] if queries else market_input.question,
        title=f"Primary X context for {market_input.question}",
        url=x_url,
        author="",
        published_at="",
        snippet=market_input.market_context or market_input.question,
        raw_text=" ".join(filter(None, [market_input.question, market_input.market_context, market_input.resolution_criteria])),
        keyword_set=keyword_set,
        engagement={},
        raw=None,
    )


def build_seed_search_record(*, source_type: str, query: str, keyword_set: set[str]) -> dict[str, Any]:
    normalized_query = normalize_space(query) or "market signal"
    if source_type == "x":
        url = f"https://x.com/search?q={urllib.parse.quote_plus(normalized_query)}&src=typed_query&f=live"
    elif source_type == "tiktok":
        url = f"https://www.tiktok.com/search?q={urllib.parse.quote_plus(normalized_query)}"
    else:
        url = f"https://www.google.com/search?q={urllib.parse.quote_plus(normalized_query)}"

    return {
        "id": slugify(f"{source_type}-{url}")[:80],
        "source_type": source_type,
        "provider": "seed-search-fallback",
        "query": normalized_query,
        "title": f"Seed fallback search for {source_type.upper()}",
        "url": url,
        "author": "",
        "published_at": datetime.now(timezone.utc).isoformat(),
        "snippet": f"Provider access is limited; using {source_type} search seed for continued analysis.",
        "raw_text": normalized_query,
        "relevance_score": 0.12,
        "engagement": {},
    }


def collect_social_reference_records(
    *,
    records: list[dict[str, Any]],
    queries: list[str],
    keyword_set: set[str],
    include_raw: bool,
) -> list[dict[str, Any]]:
    derived: list[dict[str, Any]] = []
    for record in records:
        source_type = normalize_space(record.get("source_type", ""))
        if source_type in {"x", "tiktok"}:
            continue
        text_blob = " ".join(
            filter(
                None,
                [
                    normalize_space(record.get("title", "")),
                    normalize_space(record.get("snippet", "")),
                    normalize_space(record.get("raw_text", "")),
                    normalize_space(record.get("url", "")),
                ],
            )
        )
        if not text_blob:
            continue

        for url in extract_urls(text_blob):
            lowered = url.lower()
            if any(domain in lowered for domain in ("x.com/", "twitter.com/", "xcancel.com/")):
                query = infer_matching_query(text_blob, queries)
                derived_record = build_source_record(
                    source_type="x",
                    provider=f"derived-from-{source_type}",
                    query=query,
                    title=f"X reference from {source_type}: {normalize_space(record.get('title', 'Source item'))}",
                    url=url,
                    author=normalize_space(record.get("author", "")),
                    published_at=normalize_space(record.get("published_at", "")),
                    snippet=normalize_space(record.get("snippet", "")),
                    raw_text=text_blob,
                    keyword_set=keyword_set,
                    engagement={},
                    raw=record if include_raw else None,
                )
                if derived_record:
                    derived.append(derived_record)
            if "tiktok.com/" in lowered:
                query = infer_matching_query(text_blob, queries)
                derived_record = build_source_record(
                    source_type="tiktok",
                    provider=f"derived-from-{source_type}",
                    query=query,
                    title=f"TikTok reference from {source_type}: {normalize_space(record.get('title', 'Source item'))}",
                    url=url,
                    author=normalize_space(record.get("author", "")),
                    published_at=normalize_space(record.get("published_at", "")),
                    snippet=normalize_space(record.get("snippet", "")),
                    raw_text=text_blob,
                    keyword_set=keyword_set,
                    engagement={},
                    raw=record if include_raw else None,
                )
                if derived_record:
                    derived.append(derived_record)
    return derived


def extract_urls(text: str) -> list[str]:
    if not text:
        return []
    return [match.rstrip(").,]}>\"'") for match in re.findall(r"https?://[^\s<>{}]+", text)]


def build_source_record(
    *,
    source_type: str,
    provider: str,
    query: str,
    title: str,
    url: str,
    author: str,
    published_at: str,
    snippet: str,
    raw_text: str,
    keyword_set: set[str],
    engagement: dict[str, float],
    raw: Any,
) -> dict[str, Any] | None:
    normalized_title = normalize_space(title)
    normalized_snippet = normalize_space(snippet)
    normalized_raw_text = normalize_space(raw_text or f"{normalized_title} {normalized_snippet}")
    normalized_url = normalize_space(url)
    if not normalized_title or not normalized_raw_text or not normalized_url:
        return None

    full_text = " ".join(filter(None, [normalized_title, normalized_snippet, normalized_raw_text, author]))
    query_token_set = keyword_tokens(query)
    query_overlap = len(keyword_tokens(full_text).intersection(query_token_set))
    if source_type == "tiktok":
        base_min_overlap = 0
    else:
        base_min_overlap = 1 if source_type in {"x", "youtube", "news", "google"} else 2
    min_query_overlap = min(base_min_overlap, len(query_token_set)) if query_token_set else 0
    if query_token_set and query_overlap < min_query_overlap:
        return None

    relevance_score = compute_relevance_score(
        text=full_text,
        keyword_set=keyword_set,
        query_token_set=query_token_set,
        engagement=engagement,
    )
    payload = {
        "id": slugify(f"{source_type}-{normalized_url}")[:80],
        "source_type": source_type,
        "provider": provider,
        "query": query or normalized_title,
        "title": normalized_title,
        "url": normalized_url,
        "author": normalize_space(author),
        "published_at": normalize_space(published_at),
        "snippet": normalized_snippet,
        "raw_text": normalized_raw_text,
        "relevance_score": round(relevance_score, 4),
        "engagement": {key: round(value, 2) for key, value in engagement.items() if value > 0},
    }
    if raw is not None:
        payload["raw"] = raw
    return payload


def build_briefing_lines(records: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for source_type in BRIEFING_SOURCE_PRIORITY:
        best_for_source = [record for record in records if record["source_type"] == source_type][:2]
        for record in best_for_source:
            line = f"{source_type.upper()}: {record['title']} | {record['snippet'] or record['raw_text']}"
            lines.append(trim_to_length(line, 240))
    return lines[:10]


def dedupe_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for record in sorted(records, key=lambda item: item["relevance_score"], reverse=True):
        key = canonicalize_record_key(record)
        if key not in by_key:
            by_key[key] = record
    return list(by_key.values())


def limit_per_source(records: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    return sorted(records, key=lambda item: item["relevance_score"], reverse=True)[:limit]


def canonicalize_record_key(record: dict[str, Any]) -> str:
    source_type = normalize_space(record.get("source_type", "")).lower()
    canonical_url = canonicalize_url(normalize_space(record.get("url", "")))
    if canonical_url:
        return f"{source_type}|{canonical_url}"

    title = normalize_space(record.get("title", "")).lower()
    snippet = normalize_space(record.get("snippet", "")).lower()
    return f"{source_type}|{title}|{snippet[:160]}"


def canonicalize_url(url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return url.strip().lower()

    filtered_query: list[tuple[str, str]] = []
    for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in {"oc", "src", "ref", "ref_src", "feature"}:
            continue
        filtered_query.append((key, value))

    canonical_query = urllib.parse.urlencode(filtered_query, doseq=True)
    return urllib.parse.urlunsplit(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path.rstrip("/"),
            canonical_query,
            "",
        )
    ).lower()


def compute_relevance_score(
    *,
    text: str,
    keyword_set: set[str],
    query_token_set: set[str],
    engagement: dict[str, float],
) -> float:
    text_tokens = keyword_tokens(text)
    overlap = len(text_tokens.intersection(keyword_set))
    query_overlap = len(text_tokens.intersection(query_token_set))
    overlap_score = overlap / max(1, len(keyword_set))
    query_overlap_score = query_overlap / max(1, len(query_token_set)) if query_token_set else 0
    engagement_total = sum(value for value in engagement.values() if value > 0)
    engagement_score = min(0.25, math.log10(engagement_total + 1) / 10) if engagement_total > 0 else 0
    return min(1.0, 0.2 + query_overlap_score * 0.5 + overlap_score * 0.2 + engagement_score)


def run_apify_actor(
    *,
    actor_id: str,
    apify_token: str,
    actor_input: dict[str, Any],
    timeout_seconds: int,
    retries: int,
) -> list[dict[str, Any]]:
    encoded_actor = actor_id.replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{encoded_actor}/run-sync-get-dataset-items"
    body = json.dumps(actor_input).encode("utf-8")
    request = urllib.request.Request(
        url=f"{url}?token={urllib.parse.quote(apify_token)}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with open_with_retries(request, timeout_seconds=timeout_seconds, retries=retries) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_json(
    url: str,
    *,
    params: dict[str, str],
    headers: dict[str, str] | None = None,
    timeout_seconds: int,
    retries: int,
) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url=f"{url}?{query}",
        headers=headers or {},
        method="GET",
    )
    try:
        with open_with_retries(request, timeout_seconds=timeout_seconds, retries=retries) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {trim_to_length(body, 240)}") from exc


def fetch_text(url: str, *, timeout_seconds: int, retries: int) -> str:
    request = urllib.request.Request(url=url, headers={"User-Agent": "SignalMarketResearchBot/0.1"})
    with open_with_retries(request, timeout_seconds=timeout_seconds, retries=retries) as response:
        return response.read().decode("utf-8")


def open_with_retries(request: urllib.request.Request, *, timeout_seconds: int, retries: int) -> Any:
    last_error: Exception | None = None
    attempts = max(1, retries + 1)
    use_system_proxy = read_env_bool("SCRAPER_USE_SYSTEM_PROXY", False)
    opener = (
        urllib.request.build_opener()
        if use_system_proxy
        else urllib.request.build_opener(urllib.request.ProxyHandler({}))
    )
    for attempt in range(attempts):
        try:
            return opener.open(request, timeout=timeout_seconds)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt >= attempts - 1:
                break
    if last_error is None:
        raise RuntimeError("Request failed with unknown error.")
    raise last_error


def run_lava_x_fallback(
    *,
    lava_api_key: str,
    lava_x_endpoint: str,
    queries: list[str],
    x_post_url: str,
    limit: int,
    timeout_seconds: int,
    retries: int,
) -> list[dict[str, Any]]:
    seed_query = normalize_space(x_post_url) or (queries[0] if queries else "")
    if not seed_query:
        return []

    payload = json.dumps({"query": seed_query, "limit": limit}).encode("utf-8")
    request = urllib.request.Request(
        url=lava_x_endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {lava_api_key}",
        },
        method="POST",
    )

    with open_with_retries(request, timeout_seconds=timeout_seconds, retries=retries) as response:
        raw = json.loads(response.read().decode("utf-8"))

    if isinstance(raw, dict):
        items = raw.get("data") or raw.get("results") or []
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    return []


def detect_x_provider(item: dict[str, Any]) -> str:
    provider = normalize_space(item.get("provider", ""))
    if provider:
        return provider
    if any(key in item for key in ("tweetId", "tweet_id", "retweetCount", "fullText")):
        return "x-feed"
    return "x-unknown"


def detect_google_provider(item: dict[str, Any], actor_ids: list[str]) -> str:
    provider = normalize_space(item.get("provider", ""))
    if provider:
        return provider
    if actor_ids:
        return f"apify/{actor_ids[0]}"
    return "google-search"


def is_usable_x_payload(payload: list[dict[str, Any]]) -> bool:
    if not payload:
        return False
    first = payload[0]
    if not isinstance(first, dict):
        return False
    if "demo" in first and len(first.keys()) == 1:
        return False
    if "noResults" in first and len(first.keys()) == 1:
        return False
    return True


def keyword_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9']+", text.lower())
        if len(token) >= 3 and token not in STOP_WORDS
    }


def build_keyword_query(text: str) -> str:
    tokens = [token for token in re.findall(r"[A-Za-z0-9']+", text) if len(token) >= 3]
    prioritized: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        lowered = token.lower()
        if lowered in STOP_WORDS or lowered in seen:
            continue
        prioritized.append(token)
        seen.add(lowered)
        if len(prioritized) >= 6:
            break
    return " ".join(prioritized)


def infer_matching_query(text: str, queries: list[str]) -> str:
    lowered_text = text.lower()
    best_query = queries[0] if queries else ""
    best_score = -1
    for query in queries:
        score = sum(1 for token in keyword_tokens(query) if token in lowered_text)
        if score > best_score:
            best_query = query
            best_score = score
    return best_query


def normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def strip_html(value: str) -> str:
    return normalize_space(re.sub(r"<[^>]+>", " ", value))


def dedupe_strings(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = normalize_space(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
    return output


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "report"


def first_present(item: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = item.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def to_non_negative_number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, numeric)


def trim_to_length(value: str, limit: int) -> str:
    normalized = normalize_space(value)
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 3)].rstrip() + "..."


def utc_from_unix(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return ""


def _require_string(value: Any, field_name: str) -> str:
    cleaned = normalize_space(value)
    if not cleaned:
        raise ValueError(f"Missing required field '{field_name}' in market research input.")
    return cleaned


def _optional_string(value: Any) -> str:
    return normalize_space(value)


def parse_csv_actors(value: str) -> list[str]:
    if not value:
        return []
    actors: list[str] = []
    seen: set[str] = set()
    for chunk in value.split(","):
        actor = normalize_space(chunk)
        if not actor:
            continue
        lowered = actor.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        actors.append(actor)
    return actors


def read_env_int(name: str, fallback: int) -> int:
    raw = read_env(name)
    if not raw:
        return fallback
    try:
        parsed = int(raw)
    except ValueError:
        return fallback
    return parsed


def read_env_bool(name: str, fallback: bool) -> bool:
    raw = read_env(name)
    if not raw:
        return fallback
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def read_env(name: str) -> str:
    direct_value = os.environ.get(name, "").strip()
    if direct_value:
        return direct_value

    for candidate in (Path(".env.local"), Path(".env"), Path("..") / ".env.local", Path("..") / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, raw_value = stripped.split("=", 1)
            if key.strip() != name:
                continue
            value = raw_value.strip().strip('"').strip("'")
            if value:
                return value

    return ""


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise SystemExit(130)
