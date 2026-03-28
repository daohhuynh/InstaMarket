import type { AISwarmThesis, MarketState, TradeExecution } from "./sharedSchemas.js";

export interface TwitterComment {
  id: string;
  user_twitter_id: string;
  text: string;
  like_count: number;
  created_at: string;
}

export interface PersonaProfile {
  user_twitter_id: string;
  wallet_address: string;
  bankroll_usdc: number;
  risk_tolerance: "LOW" | "MEDIUM" | "HIGH";
}

export interface SwarmBuildInput {
  market_state: MarketState;
  comment: TwitterComment;
  persona: PersonaProfile;
}

export interface SwarmDecision {
  thesis: AISwarmThesis;
  research_summary: string;
  portfolio_rationale: string;
}

export interface CLOBSubmissionResult {
  accepted: boolean;
  order_id?: string;
  reason?: string;
  raw_response?: unknown;
}

export interface PersonaRunRecord {
  persona: PersonaProfile;
  comment: TwitterComment;
  thesis: AISwarmThesis;
  trade_execution?: TradeExecution;
  clob_submission?: CLOBSubmissionResult;
}

export interface PersonaSimulationResult {
  market_id: string;
  post_url: string;
  processed_comments: number;
  generated_trades: number;
  records: PersonaRunRecord[];
}

export interface PersonaSimulationConfig {
  comment_limit: number;
  min_order_usdc: number;
  bankroll_min_usdc: number;
  bankroll_max_usdc: number;
  max_concurrency: number;
}
