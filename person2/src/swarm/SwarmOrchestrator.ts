import type { LanguageModel } from "../bedrock/LanguageModel.js";
import type { SwarmBuildInput, SwarmDecision } from "../contracts/person2Contracts.js";
import type { ResearchDossier } from "../contracts/researchDossier.js";
import type { AgentInsight, TradeSide } from "../contracts/sharedSchemas.js";
import { validateAISwarmThesis } from "../contracts/sharedSchemas.js";
import {
  buildPortfolioUserPrompt,
  buildResearchUserPrompt,
  buildRiskUserPrompt,
  PORTFOLIO_SCHEMA_HINT,
  PORTFOLIO_SYSTEM_PROMPT,
  RESEARCH_SCHEMA_HINT,
  RESEARCH_SYSTEM_PROMPT,
  RISK_SCHEMA_HINT,
  RISK_SYSTEM_PROMPT,
} from "./prompts.js";

interface ResearchAgentOutput {
  summary: string;
  signals: Array<{
    source: string;
    insight: string;
    confidence: number;
  }>;
}

interface RiskAgentOutput {
  resolution_risk: string;
  event_risk: string;
  liquidity_risk: string;
  max_position_pct_bankroll: number;
}

interface PortfolioAgentOutput {
  recommended_action: TradeSide;
  recommended_size_usdc: number;
  confidence_score: number;
  rationale: string;
}

export class SwarmOrchestrator {
  constructor(private readonly model: LanguageModel) {}

  async buildDecision(input: SwarmBuildInput): Promise<SwarmDecision> {
    const research = await this.model.generateJson<ResearchAgentOutput>({
      system_prompt: RESEARCH_SYSTEM_PROMPT,
      user_prompt: buildResearchUserPrompt(input),
      json_schema_hint: RESEARCH_SCHEMA_HINT,
      temperature: 0.1,
      max_tokens: 500,
    });

    const normalizedResearch = normalizeResearch(research, input.comment.text, input.research_dossier);

    const risk = await this.model.generateJson<RiskAgentOutput>({
      system_prompt: RISK_SYSTEM_PROMPT,
      user_prompt: buildRiskUserPrompt(input, normalizedResearch.summary),
      json_schema_hint: RISK_SCHEMA_HINT,
      temperature: 0.1,
      max_tokens: 350,
    });

    const normalizedRisk = normalizeRisk(risk);

    const portfolio = await this.model.generateJson<PortfolioAgentOutput>({
      system_prompt: PORTFOLIO_SYSTEM_PROMPT,
      user_prompt: buildPortfolioUserPrompt(input, normalizedResearch.summary, normalizedRisk),
      json_schema_hint: PORTFOLIO_SCHEMA_HINT,
      temperature: 0.15,
      max_tokens: 350,
    });

    const normalizedPortfolio = normalizePortfolio(portfolio, input.persona.bankroll_usdc, normalizedRisk.max_position_pct_bankroll);

    const thesis = {
      market_id: input.market_state.market_id,
      recommended_action: normalizedPortfolio.recommended_action,
      recommended_size_usdc: normalizedPortfolio.recommended_size_usdc,
      confidence_score: normalizedPortfolio.confidence_score,
      agent_insights: toAgentInsights(normalizedResearch),
      risk_analysis: {
        resolution_risk: normalizedRisk.resolution_risk,
        event_risk: normalizedRisk.event_risk,
        liquidity_risk: normalizedRisk.liquidity_risk,
      },
    };

    validateAISwarmThesis(thesis);

    return {
      thesis,
      research_summary: normalizedResearch.summary,
      portfolio_rationale: normalizedPortfolio.rationale,
    };
  }
}

function normalizeResearch(output: ResearchAgentOutput, fallbackText: string, researchDossier?: ResearchDossier): ResearchAgentOutput {
  const safeSummary = safeString(output.summary, "No research summary generated.");
  const safeSignals = Array.isArray(output.signals)
    ? output.signals
        .filter((signal) => typeof signal?.source === "string" && typeof signal?.insight === "string")
        .slice(0, 4)
        .map((signal) => ({
          source: signal.source,
          insight: signal.insight,
          confidence: clampNumber(signal.confidence, 0, 100, 55),
        }))
    : [];

  if (safeSignals.length > 0) {
    return {
      summary: safeSummary,
      signals: safeSignals,
    };
  }

  const topExternalSource = researchDossier?.sources
    ?.slice()
    .sort((left, right) => right.relevance_score - left.relevance_score)[0];

  if (topExternalSource) {
    return {
      summary: safeSummary,
      signals: [
        {
          source: topExternalSource.source_type.toUpperCase(),
          insight: safeString(topExternalSource.snippet || topExternalSource.raw_text, fallbackText).slice(0, 220),
          confidence: clampNumber(Math.round(topExternalSource.relevance_score * 100), 0, 100, 65),
        },
      ],
    };
  }

  return {
    summary: safeSummary,
    signals: [
      {
        source: "X Comments",
        insight: fallbackText.slice(0, 220),
        confidence: 50,
      },
    ],
  };
}

function normalizeRisk(output: RiskAgentOutput): RiskAgentOutput {
  return {
    resolution_risk: safeString(output.resolution_risk, "Medium - resolution source may shift."),
    event_risk: safeString(output.event_risk, "Medium - event timing uncertainty."),
    liquidity_risk: safeString(output.liquidity_risk, "Low - simulated liquidity available."),
    max_position_pct_bankroll: clampNumber(output.max_position_pct_bankroll, 1, 100, 25),
  };
}

function normalizePortfolio(
  output: PortfolioAgentOutput,
  bankrollUsd: number,
  maxPositionPctBankroll: number,
): PortfolioAgentOutput {
  const maxAllowed = (Math.max(0, bankrollUsd) * maxPositionPctBankroll) / 100;
  const recommendedSize = clampNumber(output.recommended_size_usdc, 0, maxAllowed, Math.min(10, maxAllowed));

  return {
    recommended_action: output.recommended_action === "NO" ? "NO" : "YES",
    recommended_size_usdc: roundUsd(recommendedSize),
    confidence_score: clampNumber(output.confidence_score, 0, 100, 50),
    rationale: safeString(output.rationale, "Portfolio rationale unavailable."),
  };
}

function toAgentInsights(research: ResearchAgentOutput): AgentInsight[] {
  return research.signals.map((signal) => ({
    source: signal.source,
    insight: `${signal.insight} (confidence ${signal.confidence}%)`,
  }));
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}
