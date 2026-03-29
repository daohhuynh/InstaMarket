import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ResearchDossier } from "../contracts/researchDossier.js";
import { validateResearchDossier } from "../contracts/researchDossier.js";
import type { ThesisRequest } from "./contracts.js";

export type ScraperProgressEvent =
  | { type: "scraper_start"; message: string }
  | { type: "scraper_source"; source: string; message: string }
  | { type: "scraper_done"; message: string; source_counts: Record<string, number> };

const SCRAPER_SOURCES = ["x", "youtube", "reddit", "news", "google", "tiktok"];
const SOURCE_LABELS: Record<string, string> = {
  x: "X / Twitter",
  youtube: "YouTube",
  reddit: "Reddit",
  news: "News",
  google: "Google",
  tiktok: "TikTok",
};

export async function buildResearchDossierFromScrapers(
  request: ThesisRequest,
  onEvent?: (event: ScraperProgressEvent) => void,
): Promise<ResearchDossier> {
  const outputDir = resolve(process.cwd(), "output");
  await mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const inputPath = resolve(outputDir, `research_request_${stamp}.json`);
  const outputPath = resolve(outputDir, `research_dossier_${stamp}.json`);

  const scraperInput = {
    market_id: request.market.market_id,
    question: request.market.question,
    url: request.market.polymarket_url ?? "",
    resolution_date: request.market.resolution_date ?? "",
    market_context: request.market.market_context ?? "",
    resolution_criteria: request.market.resolution_criteria ?? "",
    x_post_url: request.post_url ?? "",
    seed_queries: buildSeedQueries(request),
  };

  await writeFile(inputPath, JSON.stringify(scraperInput, null, 2) + "\n", "utf8");

  onEvent?.({ type: "scraper_start", message: "Starting research pipeline..." });

  // Emit per-source events spread across the expected scraper runtime so the
  // UI shows realistic incremental progress while the Python process runs.
  const sourceEventTimer = emitSourceEventsAsync(onEvent);

  try {
    await runScraperProcess(inputPath, outputPath);
    sourceEventTimer.cancel();
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    validateResearchDossier(parsed);
    const dossier = parsed as ResearchDossier;
    onEvent?.({
      type: "scraper_done",
      message: `Sources collected (${Object.values(dossier.source_counts).reduce((sum, n) => sum + n, 0)} results)`,
      source_counts: dossier.source_counts,
    });
    return dossier;
  } catch (error) {
    sourceEventTimer.cancel();
    onEvent?.({ type: "scraper_done", message: "Scraper failed — using fallback sources", source_counts: {} });
    return buildFallbackDossier(request, error);
  } finally {
    await safeCleanup(inputPath);
  }
}

function emitSourceEventsAsync(onEvent?: (event: ScraperProgressEvent) => void): { cancel: () => void } {
  if (!onEvent) return { cancel: () => {} };
  let cancelled = false;
  const delayMs = 6000; // spread source events over ~36s of scraper runtime
  (async () => {
    for (const source of SCRAPER_SOURCES) {
      if (cancelled) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      if (cancelled) break;
      onEvent({ type: "scraper_source", source, message: `Scraping ${SOURCE_LABELS[source] ?? source}...` });
    }
  })();
  return { cancel: () => { cancelled = true; } };
}

async function runScraperProcess(inputPath: string, outputPath: string): Promise<void> {
  const maxItemsPerSource = parsePositiveInt(process.env.SCRAPER_MAX_ITEMS_PER_SOURCE, 6, 1, 30);
  const httpTimeoutSeconds = parsePositiveInt(process.env.SCRAPER_HTTP_TIMEOUT_SECONDS, 30, 5, 120);
  const httpRetries = parsePositiveInt(process.env.SCRAPER_HTTP_RETRIES, 2, 0, 6);
  const disableApify = parseBooleanEnv(process.env.SCRAPER_DISABLE_APIFY, false);
  const useSystemProxy = parseBooleanEnv(process.env.SCRAPER_USE_SYSTEM_PROXY, false);
  const xActors =
    process.env.APIFY_X_ACTOR_IDS ??
    process.env.APIFY_X_ACTOR_ID ??
    "apidojo/twitter-scraper-lite,apidojo/tweet-scraper,scrapier/twitter-x-tweets-scraper";
  const googleActors =
    process.env.APIFY_GOOGLE_ACTOR_IDS ?? process.env.APIFY_GOOGLE_ACTOR_ID ?? "apify/google-search-scraper";
  const tiktokActor = process.env.APIFY_TIKTOK_ACTOR_ID ?? "clockworks/tiktok-comments-scraper";

  const args = [
    "-m",
    "signalmarket_scrapers",
    "--market-research-file",
    inputPath,
    "--output",
    outputPath,
    "--max-items-per-source",
    String(maxItemsPerSource),
    "--http-timeout-seconds",
    String(httpTimeoutSeconds),
    "--http-retries",
    String(httpRetries),
    "--apify-x-actors",
    xActors,
    "--apify-google-actors",
    googleActors,
    "--apify-tiktok-actor",
    tiktokActor,
  ];
  if (disableApify) {
    args.push("--disable-apify");
  }
  if (useSystemProxy) {
    args.push("--use-system-proxy");
  }

  await spawnAndWait("python", args, 70_000).catch(async () => {
    await spawnAndWait("py", args, 70_000);
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

async function spawnAndWait(command: string, args: string[], timeoutMs: number): Promise<void> {
  const childEnv = { ...process.env };
  delete childEnv.HTTP_PROXY;
  delete childEnv.HTTPS_PROXY;
  delete childEnv.ALL_PROXY;
  delete childEnv.http_proxy;
  delete childEnv.https_proxy;
  delete childEnv.all_proxy;
  childEnv.NO_PROXY = "*";

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(`Scraper process timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Scraper process exited with code ${code}. ${stderr.slice(0, 600)}`));
    });
  });
}

function buildFallbackDossier(request: ThesisRequest, cause?: unknown): ResearchDossier {
  const now = new Date().toISOString();
  const summary = request.tweet_text.replace(/\s+/g, " ").trim().slice(0, 280);
  const seedQuery = encodeURIComponent(request.market.question || request.tweet_text || "market");
  const errorMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "Unknown scraper error.";
  const seedSources = [
    {
      id: `fallback-x-${request.market.market_id}`,
      source_type: "x" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback X search context",
      url: request.post_url ?? `https://x.com/search?q=${seedQuery}&src=typed_query&f=live`,
    },
    {
      id: `fallback-youtube-${request.market.market_id}`,
      source_type: "youtube" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback YouTube search context",
      url: `https://www.youtube.com/results?search_query=${seedQuery}`,
    },
    {
      id: `fallback-reddit-${request.market.market_id}`,
      source_type: "reddit" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback Reddit search context",
      url: `https://www.reddit.com/search/?q=${seedQuery}`,
    },
    {
      id: `fallback-news-${request.market.market_id}`,
      source_type: "news" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback Google News context",
      url: `https://news.google.com/search?q=${seedQuery}`,
    },
    {
      id: `fallback-google-${request.market.market_id}`,
      source_type: "google" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback Google search context",
      url: `https://www.google.com/search?q=${seedQuery}`,
    },
    {
      id: `fallback-tiktok-${request.market.market_id}`,
      source_type: "tiktok" as const,
      provider: "fallback-seed",
      query: request.market.question,
      title: "Fallback TikTok search context",
      url: `https://www.tiktok.com/search?q=${seedQuery}`,
    },
  ];

  const sourceCounts = {
    x: 0,
    youtube: 0,
    reddit: 0,
    news: 0,
    google: 0,
    tiktok: 0,
  };
  for (const source of seedSources) {
    sourceCounts[source.source_type] += 1;
  }

  return {
    report_id: `fallback-${request.market.market_id}`,
    generated_at: now,
    market: {
      market_id: request.market.market_id,
      question: request.market.question,
      url: request.market.polymarket_url,
      resolution_date: request.market.resolution_date,
      market_context: request.market.market_context,
      resolution_criteria: request.market.resolution_criteria,
      x_post_url: request.post_url,
      queries: buildSeedQueries(request),
    },
    briefing_lines: [summary || "No tweet text provided for fallback dossier.", "Scraper process failed; using deterministic source seeds."],
    source_counts: sourceCounts,
    sources: seedSources.map((source) => ({
      ...source,
      author: request.post_author ?? "",
      published_at: request.post_timestamp ?? now,
      snippet: summary || request.market.question,
      raw_text: summary || request.market.question,
      relevance_score: 0.35,
      engagement: {},
    })),
    collection_errors: [
      {
        source_type: "scraper_pipeline",
        error: errorMessage,
      },
    ],
  };
}

function buildSeedQueries(request: ThesisRequest): string[] {
  const terms = [
    request.market.question,
    request.market.category ?? "",
    request.market.event_title ?? "",
    request.market.slug ? request.market.slug.replace(/-/g, " ") : "",
  ]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(terms)].slice(0, 5);
}

async function safeCleanup(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // Ignore cleanup failures.
  }
}
