import type { JsonGenerationRequest, LanguageModel } from "./LanguageModel.js";

export class HeuristicLocalModel implements LanguageModel {
  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const schemaHint = request.json_schema_hint;

    if (schemaHint.includes('"signals"')) {
      const sentiment = inferSentiment(request.user_prompt);
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

    const action = inferSentiment(request.user_prompt);
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
