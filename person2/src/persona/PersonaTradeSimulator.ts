import type { CLOBGateway } from "../adapters/CLOBGateway.js";
import type {
  PersonaRunRecord,
  PersonaSimulationConfig,
  PersonaSimulationResult,
  SwarmBuildInput,
  SwarmDecision,
} from "../contracts/person2Contracts.js";
import type { MarketState, TradeExecution } from "../contracts/sharedSchemas.js";
import { validateTradeExecution } from "../contracts/sharedSchemas.js";
import { mapWithConcurrency } from "../util/concurrency.js";
import { buildPersonaFromComment } from "./BankrollAllocator.js";
import type { TwitterCommentsSource } from "./TwitterCommentsSource.js";

export interface PersonaTradeSimulatorDeps {
  comments_source: TwitterCommentsSource;
  swarm_orchestrator: {
    buildDecision(input: SwarmBuildInput): Promise<SwarmDecision>;
  };
  clob_gateway: CLOBGateway;
}

export interface SimulationRequest {
  post_url: string;
  market_state: MarketState;
  submit_to_clob: boolean;
}

const DEFAULT_CONFIG: PersonaSimulationConfig = {
  comment_limit: 30,
  min_order_usdc: 1,
  bankroll_min_usdc: 100,
  bankroll_max_usdc: 1000,
  max_concurrency: 4,
};

export class PersonaTradeSimulator {
  private readonly config: PersonaSimulationConfig;

  constructor(
    private readonly deps: PersonaTradeSimulatorDeps,
    config?: Partial<PersonaSimulationConfig>,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  async simulate(request: SimulationRequest): Promise<PersonaSimulationResult> {
    const comments = await this.deps.comments_source.getComments(request.post_url, this.config.comment_limit);

    const records = await mapWithConcurrency(
      comments,
      this.config.max_concurrency,
      async (comment): Promise<PersonaRunRecord> => {
        const persona = buildPersonaFromComment(comment, {
          min_usdc: this.config.bankroll_min_usdc,
          max_usdc: this.config.bankroll_max_usdc,
        });

        const buildInput: SwarmBuildInput = {
          market_state: request.market_state,
          comment,
          persona,
        };

        const decision = await this.deps.swarm_orchestrator.buildDecision(buildInput);
        const trade = buildTradeExecution(
          decision.thesis.recommended_action,
          decision.thesis.recommended_size_usdc,
          this.config.min_order_usdc,
          request.market_state,
          persona.user_twitter_id,
          persona.wallet_address,
        );

        if (!trade) {
          return {
            persona,
            comment,
            thesis: decision.thesis,
          };
        }

        const record: PersonaRunRecord = {
          persona,
          comment,
          thesis: decision.thesis,
          trade_execution: trade,
        };

        if (request.submit_to_clob) {
          record.clob_submission = await this.deps.clob_gateway.submitPaperTrade(trade);
        }

        return record;
      },
    );

    const generatedTrades = records.reduce((count, record) => count + (record.trade_execution ? 1 : 0), 0);

    return {
      market_id: request.market_state.market_id,
      post_url: request.post_url,
      processed_comments: comments.length,
      generated_trades: generatedTrades,
      records,
    };
  }
}

function buildTradeExecution(
  side: "YES" | "NO",
  sizeUsd: number,
  minOrderUsd: number,
  marketState: MarketState,
  userTwitterId: string,
  walletAddress: string,
): TradeExecution | undefined {
  const roundedSize = Math.round(sizeUsd * 100) / 100;
  if (roundedSize < minOrderUsd) {
    return undefined;
  }

  const trade: TradeExecution = {
    user_twitter_id: userTwitterId,
    wallet_address: walletAddress,
    market_id: marketState.market_id,
    side,
    size_usdc: roundedSize,
    execution_price: side === "YES" ? marketState.yes_price : marketState.no_price,
    timestamp: new Date().toISOString(),
  };

  validateTradeExecution(trade);
  return trade;
}
