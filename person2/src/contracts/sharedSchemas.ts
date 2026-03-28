export type TradeSide = "YES" | "NO";

export interface AgentInsight {
  source: string;
  insight: string;
}

export interface RiskAnalysis {
  resolution_risk: string;
  event_risk: string;
  liquidity_risk: string;
}

export interface AISwarmThesis {
  market_id: string;
  recommended_action: TradeSide;
  recommended_size_usdc: number;
  confidence_score: number;
  agent_insights: AgentInsight[];
  risk_analysis: RiskAnalysis;
}

export interface MarketState {
  market_id: string;
  question: string;
  url: string;
  yes_price: number;
  no_price: number;
  volume_24h: number;
  liquidity: number;
  resolution_date: string;
}

export interface SavedMarketDelta {
  market_id: string;
  saved_at_timestamp: string;
  saved_yes_price: number;
  current_yes_price: number;
  price_delta: string;
  is_favorable: boolean;
}

export interface TradeExecution {
  user_twitter_id: string;
  wallet_address: string;
  market_id: string;
  side: TradeSide;
  size_usdc: number;
  execution_price: number;
  timestamp: string;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTradeSide(value: unknown): value is TradeSide {
  return value === "YES" || value === "NO";
}

export function validateMarketState(value: unknown): asserts value is MarketState {
  assert(isObject(value), "market_state must be an object");
  assert(isString(value.market_id) && value.market_id.length > 0, "market_state.market_id is required");
  assert(isString(value.question) && value.question.length > 0, "market_state.question is required");
  assert(isString(value.url) && value.url.length > 0, "market_state.url is required");
  assert(isFiniteNumber(value.yes_price) && value.yes_price >= 0 && value.yes_price <= 1, "market_state.yes_price must be between 0 and 1");
  assert(isFiniteNumber(value.no_price) && value.no_price >= 0 && value.no_price <= 1, "market_state.no_price must be between 0 and 1");
  assert(isFiniteNumber(value.volume_24h) && value.volume_24h >= 0, "market_state.volume_24h must be >= 0");
  assert(isFiniteNumber(value.liquidity) && value.liquidity >= 0, "market_state.liquidity must be >= 0");
  assert(isString(value.resolution_date) && value.resolution_date.length > 0, "market_state.resolution_date is required");
}

export function validateAISwarmThesis(value: unknown): asserts value is AISwarmThesis {
  assert(isObject(value), "ai_swarm_thesis must be an object");
  assert(isString(value.market_id) && value.market_id.length > 0, "ai_swarm_thesis.market_id is required");
  assert(isTradeSide(value.recommended_action), "ai_swarm_thesis.recommended_action must be YES or NO");
  assert(
    isFiniteNumber(value.recommended_size_usdc) && value.recommended_size_usdc >= 0,
    "ai_swarm_thesis.recommended_size_usdc must be >= 0",
  );
  assert(
    isFiniteNumber(value.confidence_score) && value.confidence_score >= 0 && value.confidence_score <= 100,
    "ai_swarm_thesis.confidence_score must be between 0 and 100",
  );
  assert(Array.isArray(value.agent_insights), "ai_swarm_thesis.agent_insights must be an array");
  for (const insight of value.agent_insights) {
    assert(isObject(insight), "agent_insights entries must be objects");
    assert(isString(insight.source) && insight.source.length > 0, "agent_insights.source is required");
    assert(isString(insight.insight) && insight.insight.length > 0, "agent_insights.insight is required");
  }

  assert(isObject(value.risk_analysis), "ai_swarm_thesis.risk_analysis must be an object");
  assert(
    isString(value.risk_analysis.resolution_risk) && value.risk_analysis.resolution_risk.length > 0,
    "risk_analysis.resolution_risk is required",
  );
  assert(
    isString(value.risk_analysis.event_risk) && value.risk_analysis.event_risk.length > 0,
    "risk_analysis.event_risk is required",
  );
  assert(
    isString(value.risk_analysis.liquidity_risk) && value.risk_analysis.liquidity_risk.length > 0,
    "risk_analysis.liquidity_risk is required",
  );
}

export function validateTradeExecution(value: unknown): asserts value is TradeExecution {
  assert(isObject(value), "trade_execution must be an object");
  assert(
    isString(value.user_twitter_id) && value.user_twitter_id.length > 0,
    "trade_execution.user_twitter_id is required",
  );
  assert(
    isString(value.wallet_address) && value.wallet_address.length > 0,
    "trade_execution.wallet_address is required",
  );
  assert(isString(value.market_id) && value.market_id.length > 0, "trade_execution.market_id is required");
  assert(isTradeSide(value.side), "trade_execution.side must be YES or NO");
  assert(isFiniteNumber(value.size_usdc) && value.size_usdc > 0, "trade_execution.size_usdc must be > 0");
  assert(
    isFiniteNumber(value.execution_price) && value.execution_price >= 0 && value.execution_price <= 1,
    "trade_execution.execution_price must be between 0 and 1",
  );
  assert(isString(value.timestamp) && value.timestamp.length > 0, "trade_execution.timestamp is required");
}
