import type { LanguageModel } from "../bedrock/LanguageModel.js";
import { formatResearchDossierForPrompt } from "../contracts/researchDossier.js";
import { loadAnalystSkills } from "./skillsLoader.js";
import type { AnalystPass, ThesisBuildInput, ThesisJson, ThesisRequest } from "./contracts.js";
import { normalizeThesis } from "./contracts.js";

interface SynthesizedThesisResponse {
  fair_probability: number;
  confidence: number;
  catalysts: string[];
  invalidation: string[];
  explanation: string;
  risk_flags: string[];
  suggested_action: "YES" | "NO" | "SKIP";
  suggested_amount_usdc: number;
  stop_loss_cents: number;
}

interface AnalystResponse {
  summary: string;
  bullets: string[];
}

export type ThesisProgressEvent =
  | { type: "agent_start"; agent: string; message: string }
  | { type: "agent_done"; agent: string; message: string };

export class ThesisEngine {
  constructor(private readonly model: LanguageModel) {}

  async buildThesis(input: ThesisBuildInput, onEvent?: (event: ThesisProgressEvent) => void): Promise<ThesisJson> {
    const skills = await loadAnalystSkills();
    const marketBlock = buildMarketBlock(input.request);
    const dossierBlock = formatResearchDossierForPrompt(input.dossier, 8);

    onEvent?.({ type: "agent_start", agent: "Market Analyst", message: "Analysing market structure & fair pricing..." });
    const marketAnalyst = await this.runAnalyst({
      role: "Market Analyst",
      skill: skills.market_analyst,
      marketBlock,
      dossierBlock,
      request: input.request,
      task: "Estimate fair pricing versus live odds and identify market structure signals.",
    });
    onEvent?.({ type: "agent_done", agent: "Market Analyst", message: "Market Analyst complete" });

    onEvent?.({ type: "agent_start", agent: "Evidence Analyst", message: "Weighing supporting & contradicting evidence..." });
    const evidenceAnalyst = await this.runAnalyst({
      role: "Evidence Analyst",
      skill: skills.evidence_analyst,
      marketBlock,
      dossierBlock,
      request: input.request,
      task: "Extract strongest externally supported evidence and contradictory evidence.",
    });
    onEvent?.({ type: "agent_done", agent: "Evidence Analyst", message: "Evidence Analyst complete" });

    onEvent?.({ type: "agent_start", agent: "Resolution Analyst", message: "Checking resolution criteria & edge cases..." });
    const resolutionAnalyst = await this.runAnalyst({
      role: "Resolution Analyst",
      skill: skills.resolution_analyst,
      marketBlock,
      dossierBlock,
      request: input.request,
      task: "Focus on resolution criteria, ambiguity, and disqualifying scenarios.",
    });
    onEvent?.({ type: "agent_done", agent: "Resolution Analyst", message: "Resolution Analyst complete" });

    onEvent?.({ type: "agent_start", agent: "PM Synthesizer", message: "Synthesising final thesis & position sizing..." });
    const synth = await this.generateJsonWithRetry<SynthesizedThesisResponse>({
      system_prompt: [
        "You are PM Synthesizer, a professional prediction-market portfolio manager.",
        skills.pm_synthesizer,
        "Return compact, risk-aware JSON only.",
        "fair_probability and confidence must be numeric percentages on a 0-100 scale, not 0-1 decimals.",
      ].join("\n\n"),
      user_prompt: [
        marketBlock,
        dossierBlock,
        "Market Analyst notes:",
        formatAnalystPass(marketAnalyst),
        "Evidence Analyst notes:",
        formatAnalystPass(evidenceAnalyst),
        "Resolution Analyst notes:",
        formatAnalystPass(resolutionAnalyst),
        "Task: produce one actionable thesis with stop loss.",
      ].join("\n\n"),
      json_schema_hint:
        '{"fair_probability":63,"confidence":58,"catalysts":[""],"invalidation":[""],"explanation":"string","risk_flags":[""],"suggested_action":"YES","suggested_amount_usdc":25,"stop_loss_cents":15}',
      temperature: 0.15,
      max_tokens: 360,
    });

    onEvent?.({ type: "agent_done", agent: "PM Synthesizer", message: "Thesis synthesised" });

    return normalizeThesis(
      {
        ...synth,
        analyst_notes: {
          market_analyst: marketAnalyst,
          evidence_analyst: evidenceAnalyst,
          resolution_analyst: resolutionAnalyst,
          pm_synthesizer: {
            summary: normalizeString(synth.explanation, "No PM synthesis explanation returned."),
            bullets: [
              `Suggested action: ${normalizeString(synth.suggested_action, "SKIP")}`,
              `Suggested amount: ${normalizeNumber(synth.suggested_amount_usdc, 0)} USDC`,
              `Stop loss: ${normalizeNumber(synth.stop_loss_cents, 15)} cents`,
            ],
          },
        },
      },
      input,
    );
  }

  private async runAnalyst(input: {
    role: string;
    skill: string;
    marketBlock: string;
    dossierBlock: string;
    request: ThesisRequest;
    task: string;
  }): Promise<AnalystPass> {
    const response = await this.generateJsonWithRetry<AnalystResponse>({
      system_prompt: [`You are ${input.role}.`, input.skill, "Return JSON only."].join("\n\n"),
      user_prompt: [
        input.marketBlock,
        input.dossierBlock,
        `Tweet context: ${input.request.tweet_text}`,
        `Task: ${input.task}`,
      ].join("\n\n"),
      json_schema_hint: '{"summary":"string","bullets":["string"]}',
      temperature: 0.1,
      max_tokens: 240,
    });

    return {
      summary: normalizeString(response.summary, "No analyst summary returned."),
      bullets: normalizeStringArray(response.bullets, []).slice(0, 5),
    };
  }

  private async generateJsonWithRetry<T>(request: {
    system_prompt: string;
    user_prompt: string;
    json_schema_hint: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.model.generateJson<T>(request);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Model generation failed.");
  }
}

function buildMarketBlock(request: ThesisRequest): string {
  const market = request.market;
  return [
    `Market ID: ${market.market_id}`,
    `Question: ${market.question}`,
    `Category: ${market.category ?? ""}`,
    `Event Title: ${market.event_title ?? ""}`,
    `YES odds (%): ${normalizeNumber(market.yes_odds, 50)}`,
    `NO odds (%): ${normalizeNumber(market.no_odds, 50)}`,
    `Volume: ${market.volume ?? ""}`,
    `Resolution date: ${market.resolution_date ?? ""}`,
    `Resolution criteria: ${market.resolution_criteria ?? ""}`,
    `Market context: ${market.market_context ?? ""}`,
    `Post URL: ${request.post_url ?? ""}`,
    `Post author: ${request.post_author ?? ""}`,
    `Post timestamp: ${request.post_timestamp ?? ""}`,
  ].join("\n");
}

function formatAnalystPass(analyst: AnalystPass): string {
  const bullets = analyst.bullets.map((bullet) => `- ${bullet}`).join("\n");
  return [`Summary: ${analyst.summary}`, bullets].filter(Boolean).join("\n");
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
