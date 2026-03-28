import test from "node:test";
import assert from "node:assert/strict";
import { PersonaTradeSimulator } from "../src/persona/PersonaTradeSimulator.js";
import { StaticTwitterCommentsSource } from "../src/persona/TwitterCommentsSource.js";

test("PersonaTradeSimulator only emits trades above min order and submits to CLOB", async () => {
  const commentsSource = new StaticTwitterCommentsSource([
    {
      id: "c1",
      user_twitter_id: "alpha",
      text: "Maybe yes but not sure.",
      like_count: 10,
      created_at: "2026-03-28T12:00:00Z",
    },
    {
      id: "c2",
      user_twitter_id: "bravo",
      text: "I am very confident this resolves NO.",
      like_count: 120,
      created_at: "2026-03-28T12:01:00Z",
    },
  ]);

  const submittedSides: string[] = [];

  const simulator = new PersonaTradeSimulator(
    {
      comments_source: commentsSource,
      swarm_orchestrator: {
        async buildDecision(input) {
          const isFirst = input.comment.id === "c1";
          return {
            thesis: {
              market_id: input.market_state.market_id,
              recommended_action: isFirst ? "YES" : "NO",
              recommended_size_usdc: isFirst ? 0.5 : 12,
              confidence_score: isFirst ? 51 : 70,
              agent_insights: [
                {
                  source: "X Comments",
                  insight: "Synthetic test signal.",
                },
              ],
              risk_analysis: {
                resolution_risk: "Low",
                event_risk: "Medium",
                liquidity_risk: "Low",
              },
            },
            research_summary: "summary",
            portfolio_rationale: "rationale",
          };
        },
      },
      clob_gateway: {
        async submitPaperTrade(trade) {
          submittedSides.push(trade.side);
          return {
            accepted: true,
            order_id: "order_1",
          };
        },
      },
    },
    {
      min_order_usdc: 1,
      comment_limit: 10,
      bankroll_min_usdc: 100,
      bankroll_max_usdc: 200,
      max_concurrency: 2,
    },
  );

  const result = await simulator.simulate({
    post_url: "https://x.com/post/1",
    market_state: {
      market_id: "0x123abc",
      question: "Will something happen?",
      url: "https://polymarket.com/event/1",
      yes_price: 0.66,
      no_price: 0.34,
      volume_24h: 1000,
      liquidity: 500,
      resolution_date: "2026-07-01T00:00:00Z",
    },
    submit_to_clob: true,
  });

  assert.equal(result.processed_comments, 2);
  assert.equal(result.generated_trades, 1);
  assert.equal(submittedSides.length, 1);
  assert.equal(submittedSides[0], "NO");

  const emittedTrade = result.records.find((record) => record.trade_execution)?.trade_execution;
  assert.ok(emittedTrade);
  assert.equal(emittedTrade.side, "NO");
  assert.equal(emittedTrade.execution_price, 0.34);
});
