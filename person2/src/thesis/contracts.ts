import type { ResearchDossier } from "../contracts/researchDossier.js";

export type ThesisSide = "YES" | "NO" | "SKIP";

export interface ThesisRequestMarket {
  market_id: string;
  question: string;
  category?: string;
  event_title?: string;
  slug?: string;
  polymarket_url?: string;
  yes_odds?: number;
  no_odds?: number;
  volume?: string;
  resolution_date?: string;
  market_context?: string;
  resolution_criteria?: string;
}

export interface ThesisRequest {
  tweet_text: string;
  post_url?: string;
  post_author?: string;
  post_timestamp?: string;
  market: ThesisRequestMarket;
}

export interface AnalystPass {
  summary: string;
  bullets: string[];
}

export interface ThesisJson {
  market_id: string;
  fair_probability: number;
  confidence: number;
  catalysts: string[];
  invalidation: string[];
  explanation: string;
  risk_flags: string[];
  suggested_action: ThesisSide;
  suggested_amount_usdc: number;
  stop_loss_cents: number;
  analyst_notes: {
    market_analyst: AnalystPass;
    evidence_analyst: AnalystPass;
    resolution_analyst: AnalystPass;
    pm_synthesizer: AnalystPass;
  };
  research_dossier_meta: {
    report_id?: string;
    source_counts: Record<string, number>;
  };
}

export interface ThesisBuildInput {
  request: ThesisRequest;
  dossier: ResearchDossier;
}

export function validateThesisRequest(request: unknown): asserts request is ThesisRequest {
  if (!isObject(request)) {
    throw new Error("Request body must be an object.");
  }
  if (!isNonEmptyString(request.tweet_text)) {
    throw new Error("tweet_text is required.");
  }
  if (!isObject(request.market)) {
    throw new Error("market is required.");
  }
  if (!isNonEmptyString(request.market.market_id)) {
    throw new Error("market.market_id is required.");
  }
  if (!isNonEmptyString(request.market.question)) {
    throw new Error("market.question is required.");
  }
}

export function normalizeThesis(thesis: Partial<ThesisJson>, input: ThesisBuildInput): ThesisJson {
  const sourceCounts = input.dossier.source_counts ?? {};
  const totalSources =
    normalizeNumber(sourceCounts.x, 0) +
    normalizeNumber(sourceCounts.youtube, 0) +
    normalizeNumber(sourceCounts.reddit, 0) +
    normalizeNumber(sourceCounts.news, 0) +
    normalizeNumber(sourceCounts.google, 0) +
    normalizeNumber(sourceCounts.tiktok, 0);

  return {
    market_id: input.request.market.market_id,
    fair_probability: normalizeProbability(thesis.fair_probability, input.request.market.yes_odds),
    confidence: normalizeConfidence(thesis.confidence, totalSources),
    catalysts: normalizeStringArray(thesis.catalysts, ["No catalyst identified from current evidence."]),
    invalidation: normalizeStringArray(thesis.invalidation, ["Key evidence shifts against the thesis."]),
    explanation: normalizeString(
      thesis.explanation,
      "Thesis generated from market context, external evidence, and resolution constraints.",
    ),
    risk_flags: normalizeStringArray(thesis.risk_flags, ["Event timing uncertainty", "Resolution ambiguity"]),
    suggested_action: normalizeSide(thesis.suggested_action),
    suggested_amount_usdc: roundToCents(clamp(normalizeNumber(thesis.suggested_amount_usdc, 25), 0, 10_000)),
    stop_loss_cents: clamp(Math.round(normalizeNumber(thesis.stop_loss_cents, 15)), 1, 99),
    analyst_notes: {
      market_analyst: normalizeAnalystPass(thesis.analyst_notes?.market_analyst),
      evidence_analyst: normalizeAnalystPass(thesis.analyst_notes?.evidence_analyst),
      resolution_analyst: normalizeAnalystPass(thesis.analyst_notes?.resolution_analyst),
      pm_synthesizer: normalizeAnalystPass(thesis.analyst_notes?.pm_synthesizer),
    },
    research_dossier_meta: {
      report_id: input.dossier.report_id,
      source_counts: {
        x: normalizeNumber(sourceCounts.x, 0),
        youtube: normalizeNumber(sourceCounts.youtube, 0),
        reddit: normalizeNumber(sourceCounts.reddit, 0),
        news: normalizeNumber(sourceCounts.news, 0),
        google: normalizeNumber(sourceCounts.google, 0),
        tiktok: normalizeNumber(sourceCounts.tiktok, 0),
      },
    },
  };
}

function normalizeConfidence(value: unknown, totalSources: number): number {
  const evidenceWeightedFallback = clamp(32 + totalSources * 2.5, 35, 80);
  let normalized = normalizeNumber(value, evidenceWeightedFallback);
  if (normalized <= 1) {
    normalized *= 100;
  }
  if (normalized < 5 && totalSources >= 6) {
    normalized = Math.max(normalized, Math.min(45, evidenceWeightedFallback));
  }
  return clamp(Math.round(normalized), 1, 99);
}

function normalizeAnalystPass(value: unknown): AnalystPass {
  if (!isObject(value)) {
    return {
      summary: "No analyst summary returned.",
      bullets: [],
    };
  }

  return {
    summary: normalizeString(value.summary, "No analyst summary returned."),
    bullets: normalizeStringArray(value.bullets, []).slice(0, 5),
  };
}

function normalizeProbability(value: unknown, yesOdds?: number): number {
  const fallbackPct = typeof yesOdds === "number" && Number.isFinite(yesOdds) ? yesOdds : 50;
  let normalized = normalizeNumber(value, fallbackPct);
  if (normalized <= 1) {
    normalized *= 100;
  }
  return clamp(Number(normalized.toFixed(2)), 0, 100);
}

function normalizeSide(value: unknown): ThesisSide {
  if (value === "YES" || value === "NO" || value === "SKIP") {
    return value;
  }
  return "SKIP";
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
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

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
