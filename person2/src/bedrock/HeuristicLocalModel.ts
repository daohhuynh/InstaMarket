import type { JsonGenerationRequest, LanguageModel } from "./LanguageModel.js";

export class HeuristicLocalModel implements LanguageModel {
  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const schemaHint = request.json_schema_hint;
    const action = inferSentiment(request.user_prompt);

    if (schemaHint.includes('"summary"') && schemaHint.includes('"bullets"')) {
      const analyst = {
        summary:
          action === "YES"
            ? "Evidence skews constructive, but confirmation quality remains mixed."
            : "Evidence is mixed-to-cautious, with meaningful downside or timing risk.",
        bullets:
          action === "YES"
            ? [
                "Recent signals align with a moderately bullish interpretation.",
                "Resolution still depends on event timing and credible confirmation.",
                "Positioning should stay measured until higher-confidence evidence arrives.",
              ]
            : [
                "Conflicting evidence reduces conviction on a bullish outcome.",
                "Resolution ambiguity and timing risk remain meaningful.",
                "Smaller size or a wait-for-confirmation stance is prudent.",
              ],
      };
      return analyst as T;
    }

    if (schemaHint.includes('"fair_probability"') && schemaHint.includes('"suggested_action"')) {
      const fairProbability = action === "YES" ? 61 : 43;
      const confidence = action === "YES" ? 58 : 55;
      const synth = {
        fair_probability: fairProbability,
        confidence,
        catalysts:
          action === "YES"
            ? ["Momentum signals continue to support the event narrative.", "Market pricing still leaves some upside versus fair value."]
            : ["Conflicting evidence weakens the probability of resolution.", "Current market pricing may already reflect the strongest bullish case."],
        invalidation:
          action === "YES"
            ? ["Credible reporting undermines the event path.", "Resolution criteria become harder to satisfy than expected."]
            : ["Fresh high-quality confirmation appears in favor of the event.", "Market structure shifts materially toward the bullish case."],
        explanation:
          action === "YES"
            ? "Heuristic fallback thesis: the current evidence set supports a modest YES lean, but position sizing should remain disciplined because external confirmation is incomplete."
            : "Heuristic fallback thesis: the current evidence set does not justify aggressive upside positioning, so a defensive stance or SKIP remains appropriate unless stronger confirmation arrives.",
        risk_flags: ["Model fallback used", "Evidence quality is mixed", "Resolution ambiguity remains"],
        suggested_action: action === "YES" ? "YES" : "SKIP",
        suggested_amount_usdc: action === "YES" ? 25 : 10,
        stop_loss_cents: 15,
      };
      return synth as T;
    }

    if (schemaHint.includes('"signals"')) {
      const sentiment = action;
      const research = {
        summary: sentiment === "YES" ? "Momentum appears pro-YES from comment sentiment." : "Comment sentiment appears cautious and leans NO.",
        signals: [
          {
            source: "X Comments",
            insight:
              sentiment === "YES"
                ? "Language contains optimistic launch cues and bullish confidence."
                : "Language contains skepticism about timelines and delivery risk.",
            confidence: sentiment === "YES" ? 68 : 64,
          },
        ],
      };
      return research as T;
    }

    if (schemaHint.includes('"max_position_pct_bankroll"')) {
      const risk = {
        resolution_risk: "Medium - social sentiment can be noisy.",
        event_risk: "Medium - delivery timing uncertainty remains.",
        liquidity_risk: "Low - simulated market uses defined liquidity from market state.",
        max_position_pct_bankroll: 30,
      };
      return risk as T;
    }

    const portfolio = {
      recommended_action: action,
      recommended_size_usdc: action === "YES" ? 40 : 30,
      confidence_score: action === "YES" ? 66 : 61,
      rationale: "Heuristic fallback used because AWS credentials/model were unavailable.",
    };
    return portfolio as T;
  }
}

function inferSentiment(text: string): "YES" | "NO" {
  const normalized = text.toLowerCase();
  const yesKeywords = ["bull", "launch", "soon", "yes", "upside", "confident", "hype"];
  const noKeywords = ["delay", "no", "skeptic", "risk", "doubt", "late", "bear"];

  const yesScore = yesKeywords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);
  const noScore = noKeywords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);

  return yesScore >= noScore ? "YES" : "NO";
}
