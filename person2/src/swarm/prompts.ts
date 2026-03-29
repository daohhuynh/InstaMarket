import type { SwarmBuildInput } from "../contracts/person2Contracts.js";
import { formatResearchDossierForPrompt } from "../contracts/researchDossier.js";

export const RESEARCH_SYSTEM_PROMPT =
  "You are the Research Agent in a prediction-market swarm. Extract concrete evidence from the external research dossier, X comment sentiment, and market context. Keep responses concise and factual.";

export const RISK_SYSTEM_PROMPT =
  "You are the Risk Agent in a prediction-market swarm. Focus on resolution risk, event risk, and liquidity risk. Position sizing must be conservative and expressed as max percentage of bankroll.";

export const PORTFOLIO_SYSTEM_PROMPT =
  "You are the Portfolio Agent in a prediction-market swarm. Produce a single trade direction (YES or NO), size in USDC, and confidence score based on research + risk inputs.";

export const RESEARCH_SCHEMA_HINT = `{
  "summary": "string",
  "signals": [
    {
      "source": "string",
      "insight": "string",
      "confidence": 0
    }
  ]
}`;

export const RISK_SCHEMA_HINT = `{
  "resolution_risk": "string",
  "event_risk": "string",
  "liquidity_risk": "string",
  "max_position_pct_bankroll": 0
}`;

export const PORTFOLIO_SCHEMA_HINT = `{
  "recommended_action": "YES",
  "recommended_size_usdc": 0,
  "confidence_score": 0,
  "rationale": "string"
}`;

export function buildResearchUserPrompt(input: SwarmBuildInput): string {
  return [
    `Market ID: ${input.market_state.market_id}`,
    `Question: ${input.market_state.question}`,
    `YES price: ${input.market_state.yes_price}`,
    `NO price: ${input.market_state.no_price}`,
    `Liquidity: ${input.market_state.liquidity}`,
    `Comment author: ${input.comment.user_twitter_id}`,
    `Comment text: ${input.comment.text}`,
    buildExternalEvidenceSection(input),
    "Task: identify strongest directional signals and summarize them.",
  ].join("\n");
}

export function buildRiskUserPrompt(input: SwarmBuildInput, researchSummary: string): string {
  return [
    `Market ID: ${input.market_state.market_id}`,
    `Resolution date: ${input.market_state.resolution_date}`,
    `24h volume: ${input.market_state.volume_24h}`,
    `Liquidity: ${input.market_state.liquidity}`,
    `Persona bankroll: ${input.persona.bankroll_usdc}`,
    `Research summary: ${researchSummary}`,
    buildExternalEvidenceSection(input),
    "Task: produce resolution/event/liquidity risks and max bankroll percentage for one position.",
  ].join("\n");
}

export function buildPortfolioUserPrompt(
  input: SwarmBuildInput,
  researchSummary: string,
  risk: {
    resolution_risk: string;
    event_risk: string;
    liquidity_risk: string;
    max_position_pct_bankroll: number;
  },
): string {
  return [
    `Market ID: ${input.market_state.market_id}`,
    `Question: ${input.market_state.question}`,
    `Comment text: ${input.comment.text}`,
    `Persona bankroll: ${input.persona.bankroll_usdc}`,
    `Persona risk tolerance: ${input.persona.risk_tolerance}`,
    `Research summary: ${researchSummary}`,
    `Risk (resolution): ${risk.resolution_risk}`,
    `Risk (event): ${risk.event_risk}`,
    `Risk (liquidity): ${risk.liquidity_risk}`,
    `Max position % of bankroll: ${risk.max_position_pct_bankroll}`,
    "Task: decide YES or NO and position size in USDC within the risk limit.",
  ].join("\n");
}

function buildExternalEvidenceSection(input: SwarmBuildInput): string {
  if (!input.research_dossier) {
    return "External evidence dossier: none provided.";
  }

  return formatResearchDossierForPrompt(input.research_dossier, 5);
}
