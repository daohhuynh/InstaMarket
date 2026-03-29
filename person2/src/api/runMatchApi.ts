import cors from "cors";
import { config as loadDotEnv } from "dotenv";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { BedrockNovaLiteModel } from "../bedrock/BedrockNovaLiteModel.js";

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
}

interface MatchMarketRequest {
  tweet_text: string;
  candidates: CandidateMarket[];
  parser_best_market_id?: string;
  parser_best_confidence?: number;
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
}

interface ExtractMarketQueryResponse {
  queries: string[];
  key_terms: string[];
  rationale: string;
  model_mode: "bedrock" | "heuristic";
}

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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 2);
}

function uniqueNonEmpty(values: string[], maxItems = 8): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems);
}

function sanitizeQueryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s:$.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
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
): Promise<MatchMarketResponse> {
  const safeCandidates = candidates.slice(0, 25).map((candidate) => ({
    id: candidate.id,
    question: candidate.question,
    category: candidate.category ?? "",
    event_title: candidate.eventTitle ?? "",
    slug: candidate.slug ?? "",
    yes_odds: Number.isFinite(candidate.yesOdds) ? candidate.yesOdds : null,
    no_odds: Number.isFinite(candidate.noOdds) ? candidate.noOdds : null,
    parser_score: Number.isFinite(candidate.parser_score) ? candidate.parser_score : null,
  }));

  const result = await model.generateJson<Partial<MatchMarketResponse>>({
    system_prompt:
      "You are a precise market-matching model. Pick the best matching market for the tweet ONLY from candidates. " +
      "If tweet is unrelated to all candidates, set should_show=false and matched_market_id=null. Be conservative.",
    user_prompt: JSON.stringify(
      {
        tweet_text: tweetText,
        candidates: safeCandidates,
      },
      null,
      2,
    ),
    json_schema_hint:
      '{"matched_market_id":"string|null","should_show":true,"confidence_score":0,"rationale":"string","key_terms":["string"]}',
    temperature: 0.1,
    max_tokens: 220,
  });

  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedId = typeof result.matched_market_id === "string" ? result.matched_market_id : null;
  const safeId = selectedId && allowedIds.has(selectedId) ? selectedId : null;
  let confidenceRaw = parseNumber(result.confidence_score, safeId ? 72 : 0);
  if (confidenceRaw > 0 && confidenceRaw <= 1) {
    confidenceRaw *= 100;
  }
  if (safeId && confidenceRaw < 40) {
    confidenceRaw = 40;
  }
  const confidence = clamp(Math.round(confidenceRaw), 0, 99);
  const shouldShow = Boolean(result.should_show) && Boolean(safeId);

  return {
    matched_market_id: shouldShow ? safeId : null,
    should_show: shouldShow,
    confidence_score: shouldShow ? confidence : 0,
    rationale:
      typeof result.rationale === "string" && result.rationale.trim().length > 0
        ? result.rationale
        : shouldShow
          ? "Selected by Bedrock candidate reranking."
          : "Bedrock marked this tweet as unrelated to provided candidates.",
    key_terms: Array.isArray(result.key_terms) ? result.key_terms.map(String).slice(0, 10) : [],
    model_mode: "bedrock",
  };
}

function heuristicExtractMarketQueries(
  tweetText: string,
  parserQueries: string[],
  maxQueries: number,
  tweetTokens: string[],
  searchZeroHits: boolean,
): ExtractMarketQueryResponse {
  const tokens = uniqueNonEmpty([...tweetTokens, ...tokenize(tweetText)], 24);
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
  const queries = uniqueNonEmpty(
    [tokenQuery, phraseQuery, broadQuery, rescueQuery, ...parserQueries.map(sanitizeQueryText)],
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
): Promise<ExtractMarketQueryResponse> {
  const compactTokens = uniqueNonEmpty(tweetTokens.map(sanitizeQueryText), 20);
  const result = await model.generateJson<Partial<ExtractMarketQueryResponse>>({
    system_prompt:
      "You generate Polymarket public-search queries from a tweet. " +
      "Return concise, concrete queries that can match existing market titles. " +
      "Avoid filler words, stopwords, and made-up stems. Prefer entity names, event names, and time anchors.",
    user_prompt: JSON.stringify(
      {
        task: "Generate high-recall Polymarket search queries for this tweet.",
        tweet_text: tweetText,
        tweet_tokens: compactTokens,
        parser_queries: parserQueries,
        max_queries: maxQueries,
        search_zero_hits: searchZeroHits,
        format_rules: [
          "Return 2-3 specific queries and 1-2 broader backup queries.",
          "Each query should be 2-7 words.",
          "No punctuation-heavy text. No URL fragments.",
          "If search_zero_hits=true, broaden queries while keeping the same topic/entity."
        ]
      },
      null,
      2,
    ),
    json_schema_hint:
      '{"queries":["string"],"key_terms":["string"],"rationale":"string"}',
    temperature: 0.1,
    max_tokens: 180,
  });

  const rawQueries = Array.isArray(result.queries) ? result.queries.map(String) : [];
  const rawTerms = Array.isArray(result.key_terms) ? result.key_terms.map(String) : [];
  const parserFallback = uniqueNonEmpty(parserQueries.map(sanitizeQueryText), maxQueries);
  const queries = uniqueNonEmpty(
    rawQueries
      .map((query) => sanitizeQueryText(query))
      .filter((query) => query.length >= 3 && query.length <= 120)
      .filter((query) => query.split(" ").length >= 2),
    maxQueries,
  );

  return {
    queries: queries.length > 0 ? queries : parserFallback,
    key_terms: uniqueNonEmpty(rawTerms.map((term) => sanitizeQueryText(term)), 10),
    rationale:
      typeof result.rationale === "string" && result.rationale.trim().length > 0
        ? result.rationale
        : "Generated Bedrock query candidates for Polymarket search.",
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
      };
    })
    .filter((candidate): candidate is CandidateMarket => Boolean(candidate))
    .slice(0, 30);
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

  const model = !forceHeuristic && region ? new BedrockNovaLiteModel({ region, model_id: modelId }) : null;
  const app = express();

  app.use(
    cors({
      origin: (_origin, callback) => {
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
      const tweetText = typeof body.tweet_text === "string" ? body.tweet_text.trim() : "";
      const candidates = normalizeCandidates(body.candidates);
      if (!tweetText) {
        response.status(400).json({ error: "tweet_text is required." });
        return;
      }
      if (candidates.length === 0) {
        response.status(400).json({ error: "candidates must contain at least one market." });
        return;
      }

      const aiResult = model ? await bedrockMatch(model, tweetText, candidates) : heuristicMatch(tweetText, candidates);
      const parserFallbackId =
        typeof body.parser_best_market_id === "string" && body.parser_best_market_id.trim().length > 0
          ? body.parser_best_market_id
          : null;
      const parserFallbackConfidence = clamp(parseInteger(body.parser_best_confidence, 55), 0, 99);

      const effectiveResult =
        !aiResult.should_show && parserFallbackId
          ? {
              ...aiResult,
              matched_market_id: parserFallbackId,
              should_show: true,
              confidence_score: Math.max(aiResult.confidence_score, parserFallbackConfidence),
              rationale: `${aiResult.rationale} Falling back to parser-selected market.`,
            }
          : aiResult;

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
      const tweetText = typeof body.tweet_text === "string" ? body.tweet_text.trim() : "";
      if (!tweetText) {
        response.status(400).json({ error: "tweet_text is required." });
        return;
      }

      const parserQueries = Array.isArray(body.parser_queries)
        ? body.parser_queries.map(String).map((value) => value.trim()).filter((value) => value.length > 0).slice(0, 8)
        : [];
      const tweetTokens = Array.isArray(body.tweet_tokens)
        ? body.tweet_tokens.map(String).map((value) => value.trim()).filter((value) => value.length > 1).slice(0, 32)
        : [];
      const searchZeroHits = Boolean(body.search_zero_hits);
      const maxQueries = clamp(parseInteger(body.max_queries, 5), 1, 8);

      const result = model
        ? await bedrockExtractMarketQueries(model, tweetText, parserQueries, maxQueries, tweetTokens, searchZeroHits)
        : heuristicExtractMarketQueries(tweetText, parserQueries, maxQueries, tweetTokens, searchZeroHits);

      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({
        error: message,
      });
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
