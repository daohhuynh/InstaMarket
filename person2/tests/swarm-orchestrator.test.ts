import test from "node:test";
import assert from "node:assert/strict";
import { ScriptedLanguageModel } from "../src/testing/ScriptedLanguageModel.js";
import { SwarmOrchestrator } from "../src/swarm/SwarmOrchestrator.js";

test("SwarmOrchestrator clamps size to risk max and builds shared thesis shape", async () => {
  const model = new ScriptedLanguageModel([
    {
      summary: "Comment sentiment leans bullish on launch timing.",
      signals: [
        {
          source: "X Comments",
          insight: "High confidence around imminent launch.",
          confidence: 81,
        },
      ],
    },
    {
      resolution_risk: "Low - clear resolver.",
      event_risk: "Medium - timeline sensitivity.",
      liquidity_risk: "Low - deep book.",
      max_position_pct_bankroll: 20,
    },
    {
      recommended_action: "YES",
      recommended_size_usdc: 80,
      confidence_score: 77,
      rationale: "Positive sentiment and manageable risk.",
    },
  ]);

  const orchestrator = new SwarmOrchestrator(model);
  const decision = await orchestrator.buildDecision({
    market_state: {
      market_id: "0x123abc",
      question: "Will product X launch by July?",
      url: "https://polymarket.com/event/example",
      yes_price: 0.63,
      no_price: 0.37,
      volume_24h: 123000,
      liquidity: 45000,
      resolution_date: "2026-07-01T00:00:00Z",
    },
    comment: {
      id: "c1",
      user_twitter_id: "user1",
      text: "This is looking very likely.",
      like_count: 100,
      created_at: "2026-03-28T00:00:00Z",
    },
    persona: {
      user_twitter_id: "user1",
      wallet_address: "SIM_abc",
      bankroll_usdc: 100,
      risk_tolerance: "MEDIUM",
    },
  });

  assert.equal(decision.thesis.market_id, "0x123abc");
  assert.equal(decision.thesis.recommended_action, "YES");
  assert.equal(decision.thesis.recommended_size_usdc, 20);
  assert.equal(decision.thesis.confidence_score, 77);
  assert.equal(decision.thesis.agent_insights.length, 1);
  assert.equal(decision.thesis.risk_analysis.event_risk, "Medium - timeline sensitivity.");
});
