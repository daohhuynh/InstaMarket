import cors from "cors";
// @ts-ignore
import { config as loadDotEnv } from "dotenv";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { BedrockNovaLiteModel } from "../bedrock/BedrockNovaLiteModel.js";
import type { JsonInputContentBlock } from "../bedrock/LanguageModel.js";

interface CandidateMarket {
  id: string;
  question: string;
  category?: string;
  eventTitle?: string;
  slug?: string;
  yesOdds?: number;
  noOdds?: number;
  volume?: string;
  parser_score?: number;
  parser_rank?: number;
  parser_terms?: string[];
  parser_reasons?: string[];
}

interface TweetMediaAsset {
  type: "image" | "video";
  url?: string;
  poster_url?: string;
  alt_text?: string;
}

interface MatchMarketRequest {
  tweet_text: string;
  candidates: CandidateMarket[];
  parser_best_market_id?: string;
  parser_best_confidence?: number;
  tweet_tokens?: string[];
  tweet_entities?: string[];
  tweet_domain_hints?: string[];
  media_assets?: TweetMediaAsset[];
  search_debug?: {
    queries?: string[];
    merged_count?: number;
    top_market_questions?: string[];
    retried_zero_hits?: boolean;
    used_ai_query_enhancer?: boolean;
  };
}

interface MatchMarketResponse {
  matched_market_id: string | null;
  should_show: boolean;
  confidence_score: number;
  rationale: string;
  key_terms: string[];
  model_mode: "bedrock" | "heuristic";
}

interface ExtractMarketQueryRequest {
  tweet_text: string;
  parser_queries?: string[];
  max_queries?: number;
  tweet_tokens?: string[];
  search_zero_hits?: boolean;
  signal_entities?: string[];
  domain_hints?: string[];
  media_assets?: TweetMediaAsset[];
}

interface ExtractMarketQueryResponse {
  queries: string[];
  key_terms: string[];
  rationale: string;
  model_mode: "bedrock" | "heuristic";
}

const NOISY_MEDIA_HINT_TOKENS = new Set([
  "media",
  "image",
  "video",
  "thumb",
  "thumbnail",
  "format",
  "name",
  "small",
  "medium",
  "large",
  "orig",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "m3u8",
  "pbs",
  "twimg",
  "ext",
  "tweet",
  "amplify",
  "card",
  "status",
  "photo",
]);

const GENERIC_ENTITY_ONLY_TOKENS = new Set([
  "ai",
  "openai",
  "anthropic",
  "claude",
  "chatgpt",
  "gpt",
  "gpt5",
  "xai",
  "tesla",
  "spacex",
  "apple",
  "vision",
  "bitcoin",
  "crypto",
  "model",
  "market",
  "ipo",
  "release",
]);

const OVERLAP_STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "had",
  "will",
  "would",
  "should",
  "could",
  "what",
  "when",
  "where",
  "which",
  "while",
  "all",
  "one",
  "now",
  "own",
  "its",
  "are",
  "was",
  "were",
  "been",
  "being",
  "then",
  "than",
  "also",
  "but",
  "not",
  "can",
  "did",
  "does",
  "done",
  "here",
  "there",
  "more",
  "most",
  "less",
  "end",
  // Common English words that leak through as false "specific overlap"
  "each",
  "other",
  "another",
  "every",
  "some",
  "any",
  "such",
  "how",
  "who",
  "why",
  "since",
  "just",
  "only",
  "even",
  "still",
  "very",
  "really",
  "much",
  "many",
  "first",
  "last",
  "next",
  "new",
  "old",
  "big",
  "get",
  "got",
  "make",
  "made",
  "take",
  "took",
  "come",
  "came",
  "going",
  "way",
  "day",
  "time",
  "back",
  "over",
  "out",
  "about",
  "after",
  "before",
  "between",
  "through",
  "into",
  "down",
  "look",
  "use",
  "used",
  "using",
  "keep",
  "want",
  "need",
  "try",
  "start",
  "work",
  "think",
  "know",
  "say",
  "said",
  "like",
  "right",
  "good",
  "well",
  "long",
  "great",
  "high",
  "small",
  "large",
  "world",
  "part",
  "turn",
  "place",
  "case",
  "point",
  "hand",
  "year",
  "years",
  "country",
  "countries",
]);

const SHORT_SPECIFIC_TOKENS = new Set([
  "btc",
  "eth",
  "xrp",
  "spy",
  "qqq",
  "fed",
  "ipo",
  "gdp",
  "cpi",
  "fomc",
]);

const DOMAIN_HINT_ALIGNMENT_TOKENS: Record<string, string[]> = {
  crypto: [
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "polymarket",
    "staking", "defi", "dex", "onchain", "blockchain", "stacks", "stx", "arbitrage",
  ],
  ai: [
    "ai", "openai", "anthropic", "claude", "chatgpt", "gpt", "gemini", "grok", "xai",
    "model", "llm", "robot", "unitree",
  ],
  macro: [
    "fed", "federal", "federalreserve", "inflation", "treasury", "bond", "yield",
    "sp500", "nasdaq", "dow", "economy", "gdp", "unemployment",
  ],
  politics: ["trump", "biden", "election", "senate", "house", "president", "government"],
  "apple-tech": ["apple", "iphone", "ipad", "ios", "macos", "xcode", "vision", "visionpro"],
  space: ["spacex", "nasa", "rocket", "launch", "satellite", "mars", "artemis"],
};

const ROBOTICS_ENTITY_TOKENS = new Set([
  "robot",
  "robotic",
  "humanoid",
  "unitree",
  "optimus",
  "g1",
]);

const TIMELINE_NOISE_TOKENS = new Set([
  "view",
  "views",
  "analytics",
  "post",
  "posts",
  "tweet",
  "tweets",
  "thread",
  "threads",
  "reply",
  "replies",
  "quote",
  "quotes",
  "repost",
  "reposts",
  "retweet",
  "retweets",
  "like",
  "likes",
  "comment",
  "comments",
  "bookmark",
  "bookmarks",
  "hour",
  "hours",
  "hr",
  "hrs",
  "ago",
  "show",
  "more",
]);

function loadEnvFile(fileName: string): void {
  if (!existsSync(fileName)) {
    return;
  }
  const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  }
  return fallback;
}

function stripTimelineNoiseFromText(text: string): string {
  return String(text || "")
    .replace(/\bview\s+post\s+analytics\b/gi, " ")
    .replace(/\bshow\s+more\b/gi, " ")
    .replace(/\b\d+\s*(?:h|hr|hrs)\b/gi, " ")
    .replace(/\b\d+\s*(?:views?|likes?|reposts?|retweets?|quotes?|comments?)\b/gi, " ")
    .replace(/\b\d+\s*(?:h|hr|hrs|hour|hours)\s+ago\b/gi, " ")
    .replace(/\b(?:view|views|analytics)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTimelineNoiseToken(token: string): boolean {
  const normalized = sanitizeTerm(token);
  if (!normalized) return true;
  if (TIMELINE_NOISE_TOKENS.has(normalized)) return true;
  if (/^\d{1,2}h(r|rs)?$/.test(normalized)) return true;
  return false;
}

function sanitizeSignalTokens(values: unknown, maxItems: number, minLength = 2): string[] {
  if (!Array.isArray(values)) return [];
  return uniqueNonEmpty(
    values
      .map(String)
      .map((value) => sanitizeTerm(value))
      .filter((value) => value.length >= minLength)
      .filter((value) => !isTimelineNoiseToken(value)),
    maxItems,
  );
}

function tokenize(text: string): string[] {
  return stripTimelineNoiseFromText(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 2 && !isTimelineNoiseToken(token));
}

function uniqueNonEmpty(values: string[], maxItems = 8): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems);
}

function sanitizeQueryText(value: string): string {
  return stripTimelineNoiseFromText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s:$.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function sanitizeTerm(value: string): string {
  return sanitizeQueryText(value)
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function isNoisyAlphaNumericToken(token: string): boolean {
  const normalized = sanitizeTerm(token).replace(/[^a-z0-9]/g, "");
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return false;
  const hasLetters = /[a-z]/.test(normalized);
  const hasDigits = /\d/.test(normalized);
  if (!hasLetters || !hasDigits) return false;
  return normalized.length > 6;
}

function stripNoisyTermsFromQuery(query: string): string {
  const tokens = sanitizeQueryText(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !isTimelineNoiseToken(token))
    .filter((token) => !OVERLAP_STOP_TOKENS.has(token))
    .filter((token) => !isNoisyAlphaNumericToken(token))
    .slice(0, 8);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) {
    const singleton = tokens[0] ?? "";
    const hasSignal = singleton.length >= 5 || /\d/.test(singleton) || SHORT_SPECIFIC_TOKENS.has(singleton);
    if (!hasSignal) return "";
  }
  return sanitizeQueryText(tokens.join(" "));
}

function compactSentence(value: unknown, fallback: string, maxLength = 180): string {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  const firstSentence = compact.split(/[.!?]/).map((part) => part.trim()).find(Boolean) ?? compact;
  const clipped = firstSentence.slice(0, maxLength).trim();
  return clipped.length > 0 ? clipped : fallback;
}

function normalizeKeyTerms(values: unknown, maxItems = 10): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const cleaned = values
    .map((value) => sanitizeTerm(String(value ?? "")))
    .filter((value) => value.length >= 3);
  return uniqueNonEmpty(cleaned, maxItems);
}

function buildCandidateTokenSet(candidate: CandidateMarket): Set<string> {
  const pool = `${candidate.question} ${candidate.category ?? ""} ${candidate.eventTitle ?? ""} ${candidate.slug ?? ""}`;
  return new Set(tokenize(pool));
}

function candidateMatchesDomainHints(candidate: CandidateMarket, rawHints: string[]): boolean {
  const hints = uniqueNonEmpty(
    (Array.isArray(rawHints) ? rawHints : [])
      .map((value) => sanitizeTerm(String(value)))
      .filter(Boolean),
    8,
  );
  if (hints.length === 0) return true;

  const candidateTokens = buildCandidateTokenSet(candidate);
  const knownHints = hints.filter((hint) => Array.isArray(DOMAIN_HINT_ALIGNMENT_TOKENS[hint]));
  if (knownHints.length === 0) return true;

  return knownHints.some((hint) =>
    DOMAIN_HINT_ALIGNMENT_TOKENS[hint]!.some((token) => candidateTokens.has(token)),
  );
}

function computeCandidateOverlap(tweetText: string, candidate: CandidateMarket): string[] {
  const tweetTokens = new Set(tokenize(tweetText).filter((token) => !OVERLAP_STOP_TOKENS.has(token)));
  const candidateTokens = new Set(
    [...buildCandidateTokenSet(candidate)].filter((token) => !OVERLAP_STOP_TOKENS.has(token)),
  );
  return [...tweetTokens].filter((token) => candidateTokens.has(token)).slice(0, 12);
}

function computeSpecificCandidateOverlap(tweetText: string, candidate: CandidateMarket): string[] {
  return computeCandidateOverlap(tweetText, candidate)
    .filter((token) => token.length >= 4 || /\d/.test(token) || SHORT_SPECIFIC_TOKENS.has(token))
    .filter((token) => !GENERIC_ENTITY_ONLY_TOKENS.has(token));
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeMediaAssets(input: unknown): TweetMediaAsset[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: TweetMediaAsset[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    const type = candidate.type === "video" ? "video" : candidate.type === "image" ? "image" : "";
    if (!type) continue;

    const url = normalizeHttpUrl(candidate.url);
    const posterUrl = normalizeHttpUrl(candidate.poster_url);
    const altText = typeof candidate.alt_text === "string" ? sanitizeTerm(candidate.alt_text).slice(0, 140) : "";
    if (!url && !posterUrl && !altText) continue;

    const dedupeKey = `${type}|${url}|${posterUrl}|${altText}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      type,
      url: url || undefined,
      poster_url: posterUrl || undefined,
      alt_text: altText || undefined,
    });
    if (normalized.length >= 8) break;
  }

  return normalized;
}

function isLowSignalQueryRequest(input: {
  tweetText: string;
  tweetTokens: string[];
  signalEntities: string[];
  domainHints: string[];
  mediaTextHints: string[];
  mediaAssetCount: number;
}): boolean {
  if (input.signalEntities.length > 0 || input.domainHints.length > 0) {
    return false;
  }

  const compactTweetTokens = uniqueNonEmpty(
    [...input.tweetTokens.map(sanitizeTerm), ...tokenize(input.tweetText).map(sanitizeTerm)],
    24,
  ).filter(
    (token) =>
      token.length >= 3 &&
      !isNoisyAlphaNumericToken(token) &&
      !isTimelineNoiseToken(token),
  );

  if (compactTweetTokens.length <= 2) {
    return true;
  }

  const strongTokens = compactTweetTokens.filter(
    (token) =>
      token.length >= 5 &&
      !GENERIC_ENTITY_ONLY_TOKENS.has(token) &&
      !TIMELINE_NOISE_TOKENS.has(token),
  );
  if (strongTokens.length === 0 && input.mediaTextHints.length === 0) {
    return true;
  }

  return false;
}

function extractMediaTextHints(mediaAssets: TweetMediaAsset[]): string[] {
  const hints = mediaAssets.flatMap((asset) => {
    const fromAlt = asset.alt_text ? [sanitizeTerm(asset.alt_text)] : [];
    const fromUrl = [asset.url, asset.poster_url]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .flatMap((value) => {
        try {
          const parsed = new URL(value);
          const host = String(parsed.hostname || "").toLowerCase();
          // X CDN/media URLs are mostly opaque hashes and should not influence retrieval.
          if (
            host.endsWith("pbs.twimg.com") ||
            host.endsWith("x.com") ||
            host.endsWith("twitter.com") ||
            host === "t.co"
          ) {
            return [];
          }

          const pathname = parsed.pathname;
          return pathname.split(/[\/_.-]/g).map((part) => sanitizeTerm(part));
        } catch {
          return [];
        }
      });
    return [...fromAlt, ...fromUrl];
  });
  return uniqueNonEmpty(
    hints.filter((hint) => hint.length >= 4 && !isNoisyMediaHintToken(hint)),
    20,
  );
}

function isNoisyMediaHintToken(token: string): boolean {
  const normalized = sanitizeTerm(token).replace(/[^a-z0-9]/g, "");
  if (!normalized) return true;
  if (NOISY_MEDIA_HINT_TOKENS.has(normalized)) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (normalized.length >= 10 && /[a-z]/.test(normalized) && /\d/.test(normalized)) return true;
  return false;
}

function inferImageFormat(url: string, contentType: string): "gif" | "jpeg" | "png" | "webp" | null {
  const normalized = `${contentType} ${url}`.toLowerCase();
  if (normalized.includes("image/png") || /\.png(\?|$)/.test(normalized)) return "png";
  if (normalized.includes("image/webp") || /\.webp(\?|$)/.test(normalized)) return "webp";
  if (normalized.includes("image/gif") || /\.gif(\?|$)/.test(normalized)) return "gif";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg") || /\.jpe?g(\?|$)/.test(normalized)) return "jpeg";
  return null;
}

function inferVideoFormat(url: string, contentType: string): "flv" | "mkv" | "mov" | "mp4" | "mpeg" | "mpg" | "three_gp" | "webm" | "wmv" | null {
  const normalized = `${contentType} ${url}`.toLowerCase();
  if (normalized.includes("video/mp4") || /\.mp4(\?|$)/.test(normalized)) return "mp4";
  if (normalized.includes("video/webm") || /\.webm(\?|$)/.test(normalized)) return "webm";
  if (normalized.includes("video/quicktime") || /\.mov(\?|$)/.test(normalized)) return "mov";
  if (normalized.includes("video/x-matroska") || /\.mkv(\?|$)/.test(normalized)) return "mkv";
  if (normalized.includes("video/x-flv") || /\.flv(\?|$)/.test(normalized)) return "flv";
  if (normalized.includes("video/mpeg") || /\.mpeg(\?|$)/.test(normalized)) return "mpeg";
  if (normalized.includes("video/mpg") || /\.mpg(\?|$)/.test(normalized)) return "mpg";
  if (normalized.includes("video/wmv") || /\.wmv(\?|$)/.test(normalized)) return "wmv";
  if (normalized.includes("video/3gpp") || /\.3gp(\?|$)/.test(normalized)) return "three_gp";
  return null;
}

async function fetchBinaryMedia(url: string, timeoutMs: number): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "InstaMarket/1.0",
      },
      redirect: "follow",
      signal: controller?.signal,
    });
    if (!response.ok) return null;

    const buffer = new Uint8Array(await response.arrayBuffer());
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    return { bytes: buffer, contentType };
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function buildMediaBlocksForModel(
  mediaAssets: TweetMediaAsset[],
  options: {
    enabled: boolean;
    maxBlocks: number;
    imageMaxBytes: number;
    videoMaxBytes: number;
  },
): Promise<JsonInputContentBlock[]> {
  if (!options.enabled || !Array.isArray(mediaAssets) || mediaAssets.length === 0) {
    return [];
  }

  const candidateAssets = mediaAssets.slice(0, Math.max(options.maxBlocks * 2, options.maxBlocks));
  const blocks = await Promise.all(
    candidateAssets.map(async (asset): Promise<JsonInputContentBlock | null> => {
      if (asset.type === "image" && asset.url) {
        const fetched = await fetchBinaryMedia(asset.url, 2200);
        const format = fetched ? inferImageFormat(asset.url, fetched.contentType) : null;
        if (!fetched || !format) return null;
        if (fetched.bytes.byteLength > options.imageMaxBytes) return null;
        return {
          type: "image",
          format,
          bytes: fetched.bytes,
        };
      }

      if (asset.type === "video") {
        if (asset.url) {
          const fetchedVideo = await fetchBinaryMedia(asset.url, 2500);
          const videoFormat = fetchedVideo ? inferVideoFormat(asset.url, fetchedVideo.contentType) : null;
          if (fetchedVideo && videoFormat && fetchedVideo.bytes.byteLength <= options.videoMaxBytes) {
            return {
              type: "video",
              format: videoFormat,
              bytes: fetchedVideo.bytes,
            };
          }
        }

        if (asset.poster_url) {
          const fetchedPoster = await fetchBinaryMedia(asset.poster_url, 2000);
          const posterFormat = fetchedPoster ? inferImageFormat(asset.poster_url, fetchedPoster.contentType) : null;
          if (!fetchedPoster || !posterFormat) return null;
          if (fetchedPoster.bytes.byteLength > options.imageMaxBytes) return null;
          return {
            type: "image",
            format: posterFormat,
            bytes: fetchedPoster.bytes,
          };
        }
      }

      return null;
    }),
  );

  return blocks.filter((block): block is JsonInputContentBlock => Boolean(block)).slice(0, options.maxBlocks);
}

function heuristicMatch(tweetText: string, candidates: CandidateMarket[]): MatchMarketResponse {
  const tweetTokens = new Set(tokenize(tweetText));
  if (tweetTokens.size === 0 || candidates.length === 0) {
    return {
      matched_market_id: null,
      should_show: false,
      confidence_score: 0,
      rationale: "No useful tweet tokens or candidate markets available.",
      key_terms: [],
      model_mode: "heuristic",
    };
  }

  const scored = candidates.map((candidate) => {
    const pool = `${candidate.question} ${candidate.category ?? ""} ${candidate.eventTitle ?? ""} ${candidate.slug ?? ""}`;
    const candidateTokens = new Set(tokenize(pool));
    let overlap = 0;
    for (const token of tweetTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }
    const parserBoost = Number.isFinite(candidate.parser_score) ? Number(candidate.parser_score) * 0.25 : 0;
    return {
      candidate,
      overlap,
      score: overlap + parserBoost,
      terms: [...tweetTokens].filter((token) => candidateTokens.has(token)).slice(0, 8),
    };
  });

  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];

  if (!best || best.overlap < 1) {
    return {
      matched_market_id: null,
      should_show: false,
      confidence_score: 0,
      rationale: "No candidate had enough lexical overlap with the tweet.",
      key_terms: [],
      model_mode: "heuristic",
    };
  }

  const margin = best.score - (second?.score ?? 0);
  const confidence = clamp(Math.round(45 + best.overlap * 11 + margin * 7), 40, 95);
  return {
    matched_market_id: best.candidate.id,
    should_show: true,
    confidence_score: confidence,
    rationale: `Heuristic overlap selected this market (overlap=${best.overlap}, margin=${margin.toFixed(2)}).`,
    key_terms: best.terms,
    model_mode: "heuristic",
  };
}

async function bedrockMatch(
  model: BedrockNovaLiteModel,
  tweetText: string,
  candidates: CandidateMarket[],
  mediaAssets: TweetMediaAsset[] = [],
  mediaOptions: {
    enabled: boolean;
    maxBlocks: number;
    imageMaxBytes: number;
    videoMaxBytes: number;
  },
  tweetSignals: {
    tweet_tokens?: string[];
    tweet_entities?: string[];
    tweet_domain_hints?: string[];
  } = {},
): Promise<MatchMarketResponse> {
  const mediaTextHints = extractMediaTextHints(mediaAssets);
  const normalizedTweetTokens = sanitizeSignalTokens(tweetSignals.tweet_tokens, 24, 3);
  const normalizedTweetEntities = sanitizeSignalTokens(tweetSignals.tweet_entities, 12, 3);
  const normalizedDomainHints = sanitizeSignalTokens(tweetSignals.tweet_domain_hints, 8, 2);
  const shouldScanMediaBlocks =
    Array.isArray(mediaAssets) &&
    mediaAssets.length > 0 &&
    (normalizedTweetEntities.length === 0 || normalizedTweetTokens.length < 5);
  const mediaBlocks = shouldScanMediaBlocks
    ? await buildMediaBlocksForModel(mediaAssets, mediaOptions)
    : [];
  const safeCandidates = candidates.slice(0, 25).map((candidate) => ({
    id: candidate.id,
    question: candidate.question,
    category: candidate.category ?? "",
    event_title: candidate.eventTitle ?? "",
    slug: candidate.slug ?? "",
    yes_odds: Number.isFinite(candidate.yesOdds) ? candidate.yesOdds : null,
    no_odds: Number.isFinite(candidate.noOdds) ? candidate.noOdds : null,
    parser_score: Number.isFinite(candidate.parser_score) ? candidate.parser_score : null,
    parser_rank: Number.isFinite(candidate.parser_rank) ? candidate.parser_rank : null,
    parser_terms: Array.isArray(candidate.parser_terms)
      ? candidate.parser_terms.map((term) => sanitizeTerm(String(term))).filter(Boolean).slice(0, 10)
      : [],
  }));

  const generationRequest = {
    system_prompt:
      "You are a precision market matcher for Polymarket prediction markets. " +
      "A tweet and candidate markets are provided. Select a market ONLY when the tweet discusses the SAME specific entity, event, or outcome that the market is about. " +
      "RULES: " +
      "(1) The tweet must reference a concrete entity (person, company, product, country, date, number) that also appears in the market question. " +
      "(2) Generic thematic overlap is NOT a match. 'AI is amazing' does NOT match 'Will OpenAI release GPT-5 by June?'. " +
      "(3) If the tweet is personal, social, or motivational with no predictable event, output should_show=false. " +
      "(4) Media context: only use image/video content if it contains readable text (OCR), logos, or recognizable entities. Ignore decorative images. " +
      "(5) When uncertain, ALWAYS choose should_show=false. False negatives are much cheaper than false positives. " +
      "(6) confidence_score calibration: 90+ = near-certain entity+event match, 70-89 = strong entity match with plausible event, below 70 = reject. " +
      "Output JSON only. Keep rationale under 25 words.",
    user_prompt: JSON.stringify(
      {
        tweet_text: tweetText,
        media_assets: mediaAssets.map((asset) => ({
          type: asset.type,
          url: asset.url ?? "",
          poster_url: asset.poster_url ?? "",
          alt_text: asset.alt_text ?? "",
        })),
        media_text_hints: mediaTextHints.slice(0, 16),
        media_block_count: mediaBlocks.length,
        tweet_tokens: normalizedTweetTokens,
        tweet_entities: normalizedTweetEntities,
        tweet_domain_hints: normalizedDomainHints,
        candidates: safeCandidates,
        rules: [
          "Match requires shared SPECIFIC entity (company/person/product/country/ticker/date) between tweet and market.",
          "Generic topic words (ai, crypto, election, market, tech) alone are NOT sufficient for a match.",
          "If tweet is social/personal/motivational with no bettable prediction event, reject.",
          "Media: use ONLY if image/video contains readable text, recognizable logos, or specific products.",
          "When in doubt, reject. should_show=false, matched_market_id=null."
        ]
      },
      null,
      2,
    ),
    json_schema_hint:
      '{"matched_market_id":"string|null","should_show":true,"confidence_score":0,"rationale":"string","key_terms":["string"]}',
    temperature: 0.1,
    max_tokens: 220,
  } as const;

  let result: Partial<MatchMarketResponse>;
  try {
    result = await model.generateJson<Partial<MatchMarketResponse>>({
      ...generationRequest,
      user_content_blocks: mediaBlocks,
    });
  } catch (error) {
    if (mediaBlocks.length === 0) {
      throw error;
    }
    result = await model.generateJson<Partial<MatchMarketResponse>>(generationRequest);
  }

  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedId = typeof result.matched_market_id === "string" ? result.matched_market_id : null;
  const safeId = selectedId && allowedIds.has(selectedId) ? selectedId : null;
  const selectedCandidate = safeId ? candidates.find((candidate) => candidate.id === safeId) ?? null : null;
  const modelKeyTerms = normalizeKeyTerms(result.key_terms, 10);
  const overlapTerms = selectedCandidate ? computeCandidateOverlap(tweetText, selectedCandidate) : [];
  const specificOverlapTerms = selectedCandidate ? computeSpecificCandidateOverlap(tweetText, selectedCandidate) : [];
  const candidateTokenSet = selectedCandidate ? buildCandidateTokenSet(selectedCandidate) : new Set<string>();
  const coveredTweetEntities = normalizedTweetEntities.filter((entity) => candidateTokenSet.has(entity));
  const tweetRoboticsEntities = normalizedTweetEntities.filter((entity) => ROBOTICS_ENTITY_TOKENS.has(entity));
  const candidateHasRoboticsSignal = tweetRoboticsEntities.length === 0
    || tweetRoboticsEntities.some((entity) => candidateTokenSet.has(entity))
    || [...ROBOTICS_ENTITY_TOKENS].some((token) => candidateTokenSet.has(token));

  let confidenceRaw = parseNumber(result.confidence_score, safeId ? 72 : 0);
  if (confidenceRaw > 0 && confidenceRaw <= 1) {
    confidenceRaw *= 100;
  }
  if (safeId && confidenceRaw < 40) {
    confidenceRaw = 40;
  }
  let shouldShow = Boolean(result.should_show) && Boolean(safeId);
  if (shouldShow && selectedCandidate) {
    const parserScore = parseNumber(selectedCandidate.parser_score, 0);
    const hasDomainHintAlignment = candidateMatchesDomainHints(selectedCandidate, normalizedDomainHints);
    const genericOnlyOverlap = overlapTerms.length > 0 && specificOverlapTerms.length === 0;
    const genericOnlyModelTerms =
      modelKeyTerms.length > 0 && modelKeyTerms.every((term) => GENERIC_ENTITY_ONLY_TOKENS.has(term));
    if (overlapTerms.length === 0 && coveredTweetEntities.length === 0 && parserScore < 11) {
      shouldShow = false;
    }
    if (overlapTerms.length === 1 && parserScore < 8 && confidenceRaw < 80) {
      shouldShow = false;
    }
    // Block single-token generic matches (e.g. just "openai", "claude", "vision") unless model confidence is extremely high.
    if (genericOnlyOverlap && overlapTerms.length <= 1 && coveredTweetEntities.length === 0 && confidenceRaw < 95) {
      shouldShow = false;
    }
    if (genericOnlyModelTerms && modelKeyTerms.length <= 1 && coveredTweetEntities.length === 0 && confidenceRaw < 95) {
      shouldShow = false;
    }
    // Reject entity-only "brand mention" matches unless parser evidence is very strong.
    if (specificOverlapTerms.length === 0 && coveredTweetEntities.length === 0 && parserScore < 16 && confidenceRaw < 92) {
      shouldShow = false;
    }
    // When we extracted multiple entities, candidate should cover enough of them.
    if (normalizedTweetEntities.length >= 2) {
      if (coveredTweetEntities.length === 0 && parserScore < 20) {
        shouldShow = false;
      }
      if (coveredTweetEntities.length < Math.ceil(normalizedTweetEntities.length / 2) && parserScore < 18 && confidenceRaw < 90) {
        shouldShow = false;
      }
    }

    // Confidence cap for entity-only matches:
    // if we can't show concrete overlap terms, never allow high-confidence output.
    if (specificOverlapTerms.length === 0) {
      confidenceRaw = Math.min(confidenceRaw, 82);
      if (coveredTweetEntities.length === 0) {
        confidenceRaw = Math.min(confidenceRaw, 68);
        if (parserScore < 18) {
          shouldShow = false;
        }
      }
    }
    // Guard against cross-domain drift (e.g. crypto tweet selecting macro "yield" market).
    if (!hasDomainHintAlignment && normalizedDomainHints.length > 0 && confidenceRaw < 96) {
      shouldShow = false;
    }
    // Guard against AI subdomain drift: robotics tweets should map to robotics markets.
    if (!candidateHasRoboticsSignal && tweetRoboticsEntities.length > 0 && confidenceRaw < 98) {
      shouldShow = false;
    }
  }

  const confidence = clamp(Math.round(confidenceRaw), 0, 99);
  const keyTerms = uniqueNonEmpty([
    ...modelKeyTerms,
    ...overlapTerms.map(sanitizeTerm),
  ], 10);
  const rationale = compactSentence(
    result.rationale,
    shouldShow ? "Selected by Bedrock candidate reranking." : "No reliable market match.",
    180,
  );

  return {
    matched_market_id: shouldShow ? safeId : null,
    should_show: shouldShow,
    confidence_score: shouldShow ? confidence : 0,
    rationale,
    key_terms: keyTerms,
    model_mode: "bedrock",
  };
}

function heuristicExtractMarketQueries(
  tweetText: string,
  parserQueries: string[],
  maxQueries: number,
  tweetTokens: string[],
  searchZeroHits: boolean,
  signalEntities: string[] = [],
  domainHints: string[] = [],
  mediaTextHints: string[] = [],
): ExtractMarketQueryResponse {
  const tokens = uniqueNonEmpty(
    [...signalEntities.map(sanitizeTerm), ...mediaTextHints.map(sanitizeTerm), ...tweetTokens, ...tokenize(tweetText)],
    24,
  );
  if (tokens.length === 0) {
    return {
      queries: uniqueNonEmpty(parserQueries.map(sanitizeQueryText), maxQueries),
      key_terms: [],
      rationale: "No useful tokens extracted from tweet; returning parser queries.",
      model_mode: "heuristic",
    };
  }

  const keyTerms = uniqueNonEmpty(tokens.filter((token) => token.length >= 4), 10);
  const tokenQuery = sanitizeQueryText(keyTerms.slice(0, 6).join(" "));
  const phraseQuery = sanitizeQueryText(keyTerms.slice(0, 3).join(" "));
  const broadQuery = sanitizeQueryText(keyTerms.slice(0, 2).join(" "));
  const rescueQuery = searchZeroHits ? sanitizeQueryText(keyTerms.slice(0, 1).join(" ")) : "";
  const hintedQuery = sanitizeQueryText(domainHints.map(sanitizeQueryText).join(" "));
  const queries = uniqueNonEmpty(
    [tokenQuery, phraseQuery, broadQuery, rescueQuery, hintedQuery, ...parserQueries.map(sanitizeQueryText)],
    maxQueries,
  );

  return {
    queries,
    key_terms: keyTerms,
    rationale: searchZeroHits
      ? "Heuristic extraction used broader fallback queries after zero-result signal."
      : "Heuristic extraction prioritized high-length tokens and parser query fallback.",
    model_mode: "heuristic",
  };
}

async function bedrockExtractMarketQueries(
  model: BedrockNovaLiteModel,
  tweetText: string,
  parserQueries: string[],
  maxQueries: number,
  tweetTokens: string[],
  searchZeroHits: boolean,
  signalEntities: string[] = [],
  domainHints: string[] = [],
  mediaTextHints: string[] = [],
  mediaAssets: TweetMediaAsset[] = [],
  mediaOptions: {
    enabled: boolean;
    maxBlocks: number;
    imageMaxBytes: number;
    videoMaxBytes: number;
  },
): Promise<ExtractMarketQueryResponse> {
  const compactTokens = uniqueNonEmpty(tweetTokens.map(sanitizeQueryText), 20);
  const compactEntities = uniqueNonEmpty(signalEntities.map(sanitizeTerm), 12);
  const compactHints = uniqueNonEmpty(domainHints.map(sanitizeTerm), 8);
  const compactMediaHints = uniqueNonEmpty(mediaTextHints.map(sanitizeTerm), 16);
  const shouldScanMediaBlocks =
    Array.isArray(mediaAssets) &&
    mediaAssets.length > 0 &&
    (compactEntities.length === 0 || compactTokens.length < 6 || searchZeroHits);
  const mediaBlocks = shouldScanMediaBlocks
    ? await buildMediaBlocksForModel(mediaAssets, mediaOptions)
    : [];
  const generationRequest = {
    system_prompt:
      "You generate Polymarket search queries from tweets. " +
      "RULES: " +
      "(1) Extract ONLY specific named entities, products, people, organizations, tickers, and dates from the tweet. " +
      "(2) Each query MUST contain at least one specific entity from the tweet text. " +
      "(3) NEVER generate queries using ONLY generic words: ai, crypto, election, market, stock, tech, economy, politics. " +
      "(4) If the tweet has no specific predictable entity, use parser_queries to produce 1-2 broad but on-topic queries (do not invent entities). " +
      "(4b) For crypto tweets mentioning staking/yield/chain/spread without a clear asset, include 'bitcoin' in at least one query. " +
      "(5) Media/OCR: use image content only when it contains clearly readable text, logos, or identifiable products. Decorative images add no signal. " +
      "(6) Each query: 2-5 words, lowercase, no special punctuation. " +
      "(7) Return 2-4 queries maximum. Fewer precise queries are better than many vague queries.",
    user_prompt: JSON.stringify(
      {
        task: "Generate high-precision Polymarket search queries for this tweet.",
        tweet_text: tweetText,
        media_assets: mediaAssets.map((asset) => ({
          type: asset.type,
          url: asset.url ?? "",
          poster_url: asset.poster_url ?? "",
          alt_text: asset.alt_text ?? "",
        })),
        media_block_count: mediaBlocks.length,
        tweet_tokens: compactTokens,
        signal_entities: compactEntities,
        domain_hints: compactHints,
        media_text_hints: compactMediaHints,
        parser_queries: parserQueries,
        max_queries: maxQueries,
        search_zero_hits: searchZeroHits,
        format_rules: [
          "Return 2-4 queries total. Fewer precise queries > many vague queries.",
          "Each query must be 2-5 words, lowercase.",
          "Every query MUST include at least one specific named entity from the tweet.",
          "If signal_entities is non-empty, ALL queries must include at least one signal entity.",
          "If no specific entity is present, use parser_queries for 1-2 broad fallback queries.",
          "If domain_hints includes crypto and tweet mentions staking/yield/chain/spread, include bitcoin in at least one query.",
          "If search_zero_hits=true, broaden slightly but keep entity anchors.",
          "NEVER generate queries that contain only generic words (ai, crypto, market, tech, stock)."
        ],
        avoid_tokens: ["official", "officially", "challenge", "group", "follow", "comment", "resharing", "builders"],
      },
      null,
      2,
    ),
    json_schema_hint:
      '{"queries":["string"],"key_terms":["string"],"rationale":"string"}',
    temperature: 0.1,
    max_tokens: 180,
  } as const;

  let result: Partial<ExtractMarketQueryResponse>;
  try {
    result = await model.generateJson<Partial<ExtractMarketQueryResponse>>({
      ...generationRequest,
      user_content_blocks: mediaBlocks,
    });
  } catch (error) {
    if (mediaBlocks.length === 0) {
      throw error;
    }
    result = await model.generateJson<Partial<ExtractMarketQueryResponse>>(generationRequest);
  }

  const rawQueries = Array.isArray(result.queries) ? result.queries.map(String) : [];
  const rawTerms = Array.isArray(result.key_terms) ? result.key_terms.map(String) : [];
  const parserFallback = uniqueNonEmpty(parserQueries.map(sanitizeQueryText), maxQueries);
  const queries = uniqueNonEmpty(
    rawQueries
      .map((query) => stripNoisyTermsFromQuery(query))
      .filter((query) => query.length >= 3 && query.length <= 120)
      .filter((query) => query.split(" ").length >= 2),
    maxQueries,
  );
  const mergedQueries = uniqueNonEmpty(
    [...parserFallback.map(stripNoisyTermsFromQuery), ...queries],
    maxQueries,
  );

  return {
    queries: mergedQueries,
    key_terms: normalizeKeyTerms(rawTerms, 10),
    rationale: compactSentence(result.rationale, "Generated Bedrock query candidates for Polymarket search.", 160),
    model_mode: "bedrock",
  };
}

function normalizeCandidates(input: unknown): CandidateMarket[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry): CandidateMarket | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
      if (!id || !question) return null;

      return {
        id,
        question,
        category: typeof candidate.category === "string" ? candidate.category : undefined,
        eventTitle: typeof candidate.eventTitle === "string" ? candidate.eventTitle : undefined,
        slug: typeof candidate.slug === "string" ? candidate.slug : undefined,
        yesOdds: typeof candidate.yesOdds === "number" ? candidate.yesOdds : undefined,
        noOdds: typeof candidate.noOdds === "number" ? candidate.noOdds : undefined,
        volume: typeof candidate.volume === "string" ? candidate.volume : undefined,
        parser_score: typeof candidate.parser_score === "number" ? candidate.parser_score : undefined,
        parser_rank: typeof candidate.parser_rank === "number" ? candidate.parser_rank : undefined,
        parser_terms: Array.isArray(candidate.parser_terms)
          ? candidate.parser_terms.map(String).map((term) => term.trim()).filter((term) => term.length > 0).slice(0, 10)
          : undefined,
        parser_reasons: Array.isArray(candidate.parser_reasons)
          ? candidate.parser_reasons.map(String).map((reason) => reason.trim()).filter((reason) => reason.length > 0).slice(0, 6)
          : undefined,
      };
    })
    .filter((candidate): candidate is CandidateMarket => Boolean(candidate))
    .slice(0, 30);
}

function nowIso(): string {
  return new Date().toISOString();
}

function snippet(text: unknown, maxLength = 220): string {
  if (typeof text !== "string") return "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function compactForLog(value: unknown, maxLength = 160): string {
  if (typeof value !== "string") return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function debugLog(enabled: boolean, label: string, payload: Record<string, unknown>): void {
  if (!enabled) return;
  const lines = [
    `[${nowIso()}] [match-api] ${label}`,
    ...Object.entries(payload).map(([key, value]) => {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      return `  - ${key}: ${serialized}`;
    }),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  loadDotEnv({ path: ".env.local", quiet: true });
  loadDotEnv({ quiet: true });
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const port = parseInteger(process.env.AI_MATCH_API_PORT ?? process.env.API_PORT, 8787);
  const forceHeuristic = parseBoolean(process.env.API_FORCE_LOCAL_MODEL, false);
  const region = process.env.AWS_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID;
  const allowAllOrigins = parseBoolean(process.env.AI_MATCH_ALLOW_ALL_ORIGINS, true);
  const debugEnabled = parseBoolean(process.env.AI_MATCH_DEBUG_LOG, true);
  const mediaEnabled = parseBoolean(process.env.AI_MATCH_ENABLE_MEDIA, true);
  const mediaMaxBlocks = clamp(parseInteger(process.env.AI_MATCH_MAX_MEDIA_BLOCKS, 3), 0, 6);
  const mediaMaxImageBytes = clamp(parseInteger(process.env.AI_MATCH_MAX_IMAGE_BYTES, 2_000_000), 200_000, 3_500_000);
  const mediaMaxVideoBytes = clamp(parseInteger(process.env.AI_MATCH_MAX_VIDEO_BYTES, 8_000_000), 300_000, 24_000_000);

  const model = !forceHeuristic && region ? new BedrockNovaLiteModel({ region, model_id: modelId }) : null;
  const app = express();

  app.use(
    cors({
      origin: (_origin: any, callback: any) => {
        if (allowAllOrigins) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["content-type", "authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      model_mode: model ? "bedrock" : "heuristic",
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/v1/match-market", async (request: Request, response: Response) => {
    try {
      const body = (request.body ?? {}) as Partial<MatchMarketRequest>;
      const rawTweetText = typeof body.tweet_text === "string" ? body.tweet_text.trim() : "";
      const tweetText = stripTimelineNoiseFromText(rawTweetText);
      const candidates = normalizeCandidates(body.candidates);
      if (!tweetText) {
        response.status(400).json({ error: "tweet_text is required." });
        return;
      }
      if (candidates.length === 0) {
        response.status(400).json({ error: "candidates must contain at least one market." });
        return;
      }
      const mediaAssets = normalizeMediaAssets(body.media_assets);

      const normalizedTweetTokens = sanitizeSignalTokens(body.tweet_tokens, 24, 2);
      const normalizedTweetEntities = sanitizeSignalTokens(body.tweet_entities, 12, 3);
      const normalizedTweetDomainHints = sanitizeSignalTokens(body.tweet_domain_hints, 8, 2);

      const aiResult = model
        ? await bedrockMatch(
            model,
            tweetText,
            candidates,
            mediaAssets,
            {
              enabled: mediaEnabled,
              maxBlocks: mediaMaxBlocks,
              imageMaxBytes: mediaMaxImageBytes,
              videoMaxBytes: mediaMaxVideoBytes,
            },
            {
              tweet_tokens: normalizedTweetTokens,
              tweet_entities: normalizedTweetEntities,
              tweet_domain_hints: normalizedTweetDomainHints,
            },
          )
        : heuristicMatch(tweetText, candidates);
      const parserFallbackId =
        typeof body.parser_best_market_id === "string" && body.parser_best_market_id.trim().length > 0
          ? body.parser_best_market_id
          : null;
      const parserFallbackConfidence = clamp(parseInteger(body.parser_best_confidence, 55), 0, 99);
      const parserFallbackCandidate = parserFallbackId
        ? candidates.find((candidate) => candidate.id === parserFallbackId) ?? null
        : null;
      const parserFallbackScore = parseNumber(parserFallbackCandidate?.parser_score, 0);
      const parserFallbackSpecificOverlap = parserFallbackCandidate
        ? computeSpecificCandidateOverlap(tweetText, parserFallbackCandidate)
        : [];
      const parserFallbackTokenSet = parserFallbackCandidate
        ? buildCandidateTokenSet(parserFallbackCandidate)
        : new Set<string>();
      const parserDomainAlignment = parserFallbackCandidate
        ? candidateMatchesDomainHints(
            parserFallbackCandidate,
            normalizedTweetDomainHints,
          )
        : false;
      const tweetEntitySignals = normalizedTweetEntities;
      const tweetSpecificEntities = tweetEntitySignals.filter((value) => !GENERIC_ENTITY_ONLY_TOKENS.has(value));
      const parserCoversSpecificEntity = tweetSpecificEntities.some((entity) => parserFallbackTokenSet.has(entity));
      const parserCoversAnyEntity = tweetEntitySignals.some((entity) => parserFallbackTokenSet.has(entity));
      const tweetRoboticsEntities = tweetEntitySignals.filter((entity) => ROBOTICS_ENTITY_TOKENS.has(entity));
      const parserRoboticsCheckRequired = tweetRoboticsEntities.length > 0;
      const parserCoversRoboticsSignal = tweetRoboticsEntities.some((entity) => parserFallbackTokenSet.has(entity))
        || [...ROBOTICS_ENTITY_TOKENS].some((token) => parserFallbackTokenSet.has(token));
      const aiExplicitNoExactMatch = /no exact entity|no market matches|lacks specific entity/i.test(String(aiResult.rationale || ""));
      const allowParserFallback = !aiResult.should_show
        && Boolean(parserFallbackId)
        && parserFallbackConfidence >= 90
        && parserFallbackScore >= 15
        && (parserDomainAlignment || normalizedTweetDomainHints.length === 0)
        && (!parserRoboticsCheckRequired || parserCoversRoboticsSignal)
        && (parserFallbackSpecificOverlap.length >= 2 || parserCoversSpecificEntity || parserCoversAnyEntity)
        && !(aiExplicitNoExactMatch && parserFallbackSpecificOverlap.length < 2 && !parserCoversSpecificEntity && !parserCoversAnyEntity);

      const effectiveResult =
        allowParserFallback
          ? {
              ...aiResult,
              matched_market_id: parserFallbackId,
              should_show: true,
              confidence_score: Math.max(aiResult.confidence_score, parserFallbackConfidence),
              rationale: `${compactSentence(aiResult.rationale, "Bedrock uncertain.", 120)} Falling back to high-confidence parser match.`,
            }
          : aiResult;

      const topCandidatesForLog = candidates.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        parser_rank: Number(candidate.parser_rank) || null,
        parser_score: Number(candidate.parser_score) || 0,
        question: compactForLog(candidate.question, 130),
      }));
      debugLog(debugEnabled, "match-market", {
        model_mode: model ? "bedrock" : "heuristic",
        tweet_context: snippet(tweetText, 260),
        tweet_entities: normalizedTweetEntities.slice(0, 10),
        tweet_domain_hints: normalizedTweetDomainHints.slice(0, 8),
        media_enabled: mediaEnabled,
        media_assets_count: mediaAssets.length,
        media_assets_preview: mediaAssets.slice(0, 4).map((asset) => ({
          type: asset.type,
          url: compactForLog(asset.url ?? "", 100),
          poster_url: compactForLog(asset.poster_url ?? "", 100),
          alt_text: compactForLog(asset.alt_text ?? "", 100),
        })),
        search_queries:
          body.search_debug && Array.isArray(body.search_debug.queries)
            ? body.search_debug.queries
                .map((value) => stripNoisyTermsFromQuery(String(value)))
                .filter(Boolean)
                .slice(0, 8)
            : [],
        search_result_count:
          body.search_debug && Number.isFinite(Number(body.search_debug.merged_count))
            ? Number(body.search_debug.merged_count)
            : null,
        search_top_markets:
          body.search_debug && Array.isArray(body.search_debug.top_market_questions)
            ? body.search_debug.top_market_questions.slice(0, 5).map((question) => compactForLog(question, 100))
            : [],
        parser_best_market_id: parserFallbackId,
        parser_best_confidence: parserFallbackConfidence,
        parser_fallback_score: parserFallbackScore,
        parser_fallback_specific_overlap: parserFallbackSpecificOverlap.slice(0, 8),
        parser_fallback_covers_specific_entity: parserCoversSpecificEntity,
        parser_fallback_covers_any_entity: parserCoversAnyEntity,
        parser_fallback_robotics_check_required: parserRoboticsCheckRequired,
        parser_fallback_covers_robotics_signal: parserCoversRoboticsSignal,
        parser_fallback_domain_aligned: parserDomainAlignment,
        parser_fallback_allowed: allowParserFallback,
        candidates_top5: topCandidatesForLog,
        candidates_total: candidates.length,
        ai_result: aiResult,
        effective_result: effectiveResult,
        // Decision trail: why was match accepted or rejected?
        rejection_reason: !effectiveResult.should_show
          ? (candidates.length === 0
            ? "no_candidates"
            : aiExplicitNoExactMatch
              ? "ai_explicit_no_entity_match"
              : parserFallbackSpecificOverlap.length === 0 && !parserCoversSpecificEntity
                ? "no_specific_entity_overlap"
                : "below_confidence_threshold")
          : null,
        // Media decision trail
        media_blocks_attempted: mediaAssets.length,
        media_used_for_decision: mediaEnabled && mediaAssets.length > 0,
        media_ignored_reason: mediaAssets.length > 0 && !mediaEnabled
          ? "media_disabled"
          : null,
        // Entity analysis
        tweet_specific_entities: tweetSpecificEntities.slice(0, 10),
        tweet_generic_only_entities: tweetSpecificEntities.length === 0
          && normalizedTweetEntities.length > 0,
        entity_coverage: parserFallbackCandidate
          ? `${parserFallbackSpecificOverlap.length} specific / ${
              normalizedTweetEntities.length
            } total`
          : "n/a",
      });

      response.json(effectiveResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({
        error: message,
      });
    }
  });

  app.post("/v1/extract-market-query", async (request: Request, response: Response) => {
    try {
      const body = (request.body ?? {}) as Partial<ExtractMarketQueryRequest>;
      const rawTweetText = typeof body.tweet_text === "string" ? body.tweet_text.trim() : "";
      const tweetText = stripTimelineNoiseFromText(rawTweetText);
      if (!tweetText) {
        response.status(400).json({ error: "tweet_text is required." });
        return;
      }

      const parserQueries = Array.isArray(body.parser_queries)
        ? body.parser_queries
            .map(String)
            .map((value) => stripNoisyTermsFromQuery(value))
            .filter((value) => value.length > 0)
            .slice(0, 8)
        : [];
      const tweetTokens = sanitizeSignalTokens(body.tweet_tokens, 32, 2)
        .filter((value) => !isNoisyAlphaNumericToken(value));
      const searchZeroHits = Boolean(body.search_zero_hits);
      const maxQueries = clamp(parseInteger(body.max_queries, 5), 1, 8);
      const signalEntities = sanitizeSignalTokens(body.signal_entities, 12, 3);
      const domainHints = sanitizeSignalTokens(body.domain_hints, 8, 2);
      const mediaAssets = normalizeMediaAssets(body.media_assets);
      const mediaTextHints = extractMediaTextHints(mediaAssets);
      const lowSignal = isLowSignalQueryRequest({
        tweetText,
        tweetTokens,
        signalEntities,
        domainHints,
        mediaTextHints,
        mediaAssetCount: mediaAssets.length,
      });

      const result = lowSignal
        ? {
            queries: uniqueNonEmpty(parserQueries.map(sanitizeQueryText), maxQueries),
            key_terms: [],
            rationale: "Low-signal tweet; skipped AI query expansion.",
            model_mode: "heuristic" as const,
          }
        : model
          ? await bedrockExtractMarketQueries(
              model,
              tweetText,
              parserQueries,
              maxQueries,
              tweetTokens,
              searchZeroHits,
              signalEntities,
              domainHints,
              mediaTextHints,
              mediaAssets,
              {
                enabled: mediaEnabled,
                maxBlocks: mediaMaxBlocks,
                imageMaxBytes: mediaMaxImageBytes,
                videoMaxBytes: mediaMaxVideoBytes,
              },
            )
          : heuristicExtractMarketQueries(
              tweetText,
              parserQueries,
              maxQueries,
              tweetTokens,
              searchZeroHits,
              signalEntities,
              domainHints,
              mediaTextHints,
            );

      debugLog(debugEnabled, "extract-market-query", {
        model_mode: model ? "bedrock" : "heuristic",
        tweet_context: snippet(tweetText, 260),
        input_parser_queries: parserQueries.slice(0, 8),
        input_tweet_tokens: tweetTokens.slice(0, 20),
        input_signal_entities: signalEntities.slice(0, 12),
        input_domain_hints: domainHints.slice(0, 8),
        input_media_assets_count: mediaAssets.length,
        input_media_hints: mediaTextHints.slice(0, 12),
        low_signal_short_circuit: lowSignal,
        search_zero_hits: searchZeroHits,
        output_queries: Array.isArray(result.queries) ? result.queries.slice(0, 10) : [],
        output_key_terms: Array.isArray(result.key_terms) ? result.key_terms.slice(0, 10) : [],
        output_rationale: compactForLog(result.rationale, 220),
        // Quality checks on generated queries
        output_query_count: Array.isArray(result.queries) ? result.queries.length : 0,
        queries_contain_entity: Array.isArray(result.queries) && signalEntities.length > 0
          ? result.queries.some((q: string) =>
              signalEntities.some((e) => String(q).toLowerCase().includes(e)))
          : "no_entities_to_check",
        queries_all_generic: Array.isArray(result.queries)
          ? result.queries.every((q: string) =>
              tokenize(String(q)).every((t) => GENERIC_ENTITY_ONLY_TOKENS.has(t)))
          : false,
      });

      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({
        error: message,
      });
    }
  });

  app.post("/v1/research-thesis", async (request: Request, response: Response) => {
    const outputPath = join(tmpdir(), `im-research-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    try {
      const body = (request.body ?? {}) as {
        tweet_text?: string;
        market?: { id?: string; question?: string; category?: string; yesOdds?: number; noOdds?: number };
        post_url?: string;
        post_author?: string;
        post_timestamp?: string;
      };

      const tweetText = typeof body.tweet_text === "string" ? body.tweet_text.trim() : "";
      const marketQuestion = typeof body.market?.question === "string" ? body.market.question.trim() : "";
      const marketId = typeof body.market?.id === "string" ? body.market.id.trim() : "";
      const postUrl = typeof body.post_url === "string" ? body.post_url.trim() : "";

      if (!marketQuestion) {
        response.status(400).json({ error: "market.question is required." });
        return;
      }

      // --- Step 1: Run the Python scraper to collect real sources ---
      const scraperArgs = [
        "-m", "signalmarket_scrapers",
        "--market-question", marketQuestion,
        "--market-id", marketId || "unknown",
        "--output", outputPath,
        "--max-items-per-source", "6",
      ];
      if (postUrl) scraperArgs.push("--x-post-url", postUrl);
      if (tweetText) scraperArgs.push("--query", tweetText.slice(0, 200));

      const scraperEnv = { ...process.env };

      let dossier: Record<string, unknown> = {
        report_id: `rpt-${Date.now()}-${marketId.slice(0, 8)}`,
        is_fallback: true,
        source_counts: { x: 0, youtube: 0, reddit: 0, news: 0, google: 0, tiktok: 0 },
        briefing_lines: [],
        collection_errors: [],
        top_sources: [],
        all_sources: [],
      };

      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("python3", scraperArgs, {
            cwd: process.cwd(),
            env: scraperEnv,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stderr = "";
          child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

          child.on("close", (code) => {
            if (code !== 0) {
              reject(new Error(`Scraper exited with code ${code}: ${stderr.slice(0, 300)}`));
            } else {
              resolve();
            }
          });
          child.on("error", reject);
        });

        if (existsSync(outputPath)) {
          const raw = readFileSync(outputPath, "utf-8");
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const sources = Array.isArray(parsed.sources) ? parsed.sources as Record<string, unknown>[] : [];
          const topSources = sources.slice(0, 8);

          dossier = {
            report_id: typeof parsed.report_id === "string" ? parsed.report_id : dossier.report_id,
            is_fallback: false,
            source_counts: (parsed.source_counts && typeof parsed.source_counts === "object") ? parsed.source_counts : dossier.source_counts,
            briefing_lines: Array.isArray(parsed.briefing_lines) ? parsed.briefing_lines : [],
            collection_errors: Array.isArray(parsed.collection_errors) ? parsed.collection_errors : [],
            top_sources: topSources,
            all_sources: sources,
          };
        }
      } catch (scraperError) {
        const msg = scraperError instanceof Error ? scraperError.message : String(scraperError);
        (dossier.collection_errors as string[]).push(`Scraper failed: ${msg}`);
      }

      // --- Step 2: Generate thesis using Bedrock (or heuristic) with gathered sources ---
      const briefingLines = Array.isArray(dossier.briefing_lines) ? dossier.briefing_lines as string[] : [];
      const sourceSummary = briefingLines.slice(0, 12).join("\n") || "(no sources collected)";

      let thesis: { confidence: number; explanation: string };
      let modelMode: "bedrock" | "heuristic";

      if (model) {
        const generationRequest = {
          system_prompt:
            "You are a prediction market research analyst. Given a market question, a tweet, and collected source evidence, " +
            "provide a concise thesis on whether the market is likely to resolve YES or NO. " +
            "Estimate a confidence score (0-100): 50 = uncertain, >65 = lean YES, <35 = lean NO. " +
            "Ground your analysis in the evidence provided. " +
            "Output JSON only with fields: confidence (integer 0-100) and explanation (string, max 4 sentences).",
          user_prompt: JSON.stringify({
            market_question: marketQuestion,
            tweet_text: tweetText || "(no tweet context)",
            collected_evidence: sourceSummary,
            source_counts: dossier.source_counts,
          }, null, 2),
          json_schema_hint: '{"confidence":50,"explanation":"string"}',
          temperature: 0.2,
          max_tokens: 280,
        } as const;

        const result = await model.generateJson<{ confidence?: unknown; explanation?: unknown }>(generationRequest);
        const rawConf = Number(result.confidence);
        thesis = {
          confidence: Number.isFinite(rawConf) ? Math.max(0, Math.min(100, Math.round(rawConf))) : 50,
          explanation: typeof result.explanation === "string" && result.explanation.trim()
            ? result.explanation.trim()
            : "No explanation generated.",
        };
        modelMode = "bedrock";
      } else {
        const tweetTokens = new Set((tweetText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []));
        const marketTokens = (marketQuestion.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []);
        const STOP = new Set(["the", "and", "for", "that", "this", "will", "not", "are", "was", "have", "with", "from"]);
        const overlap = marketTokens.filter(t => !STOP.has(t) && tweetTokens.has(t)).length;
        const sourceCount = Object.values(dossier.source_counts as Record<string, number>).reduce((a, b) => a + b, 0);
        const confidence = Math.min(65, 40 + overlap * 4 + Math.min(sourceCount, 5) * 2);
        thesis = {
          confidence,
          explanation: sourceCount > 0
            ? `Collected ${sourceCount} source(s). Heuristic token overlap: ${overlap} term(s) matched. No Bedrock model available for deeper analysis.`
            : `No live sources collected and no Bedrock model available. Confidence is a heuristic estimate based on token overlap only.`,
        };
        modelMode = "heuristic";
      }

      debugLog(debugEnabled, "research-thesis", {
        model_mode: modelMode,
        market_id: marketId,
        market_question: snippet(marketQuestion, 120),
        tweet_context: snippet(tweetText, 120),
        thesis_confidence: thesis.confidence,
        source_counts: dossier.source_counts,
        briefing_lines_count: briefingLines.length,
      });

      response.json({ thesis, model_mode: modelMode, dossier });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ error: `Research thesis failed: ${message}` });
    } finally {
      try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch { /* ignore cleanup errors */ }
    }
  });

  app.listen(port, () => {
    process.stdout.write(`Person2 market-match API listening on http://localhost:${port}\n`);
    process.stdout.write(`Model mode: ${model ? "bedrock" : "heuristic"}\n`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start market-match API: ${message}\n`);
  process.exitCode = 1;
});
