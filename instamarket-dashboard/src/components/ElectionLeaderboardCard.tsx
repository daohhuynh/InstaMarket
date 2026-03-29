import { motion } from "framer-motion";
import type { MarketRecord } from "../types";

interface ElectionLeaderboardCardProps {
  market: MarketRecord;
}

export function ElectionLeaderboardCard({
  market,
}: ElectionLeaderboardCardProps) {
  return (
    <motion.article className="market-card leaderboard-card" whileHover={{ y: -4 }}>
      <div className="market-card-header">
        <div className="market-icon">{market.icon}</div>
        <div>
          <h3>{market.title}</h3>
          <p>{market.sourceBias}</p>
        </div>
      </div>

      <div className="leaderboard">
        {(market.candidates ?? []).map((candidate) => (
          <div key={candidate.label} className="leader-row">
            <div
              className="leader-bar"
              style={{ width: `${Math.max(candidate.value, 2)}%` }}
            />
            <div className="leader-content">
              <span className="leader-value">
                {candidate.value < 1 ? "<1" : candidate.value}%
              </span>
              <span className="leader-avatar">{candidate.avatar ?? "?"}</span>
              <span className="leader-label">{candidate.label}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.article>
  );
}
