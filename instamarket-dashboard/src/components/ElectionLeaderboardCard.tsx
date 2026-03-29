import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { RevealOnScroll } from "./RevealOnScroll";
import type { MarketRecord } from "../types";

interface ElectionLeaderboardCardProps {
  market: MarketRecord;
  index?: number;
}

export function ElectionLeaderboardCard({
  market,
  index = 0,
}: ElectionLeaderboardCardProps) {
  const stagger = index * 0.06;

  return (
    <RevealOnScroll as="article" className="market-card leaderboard-card decision-card" delay={stagger}>
      {({ isVisible }) => (
        <>
          <div className="market-card-header">
            <div className="market-icon">{market.icon}</div>
            <div>
              <h3>{market.title}</h3>
              <p>{market.sourceBias}</p>
            </div>
          </div>

          <div className="leaderboard">
            {(market.candidates ?? []).map((candidate, candidateIndex) => (
              <motion.div
                key={candidate.label}
                className="leader-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 8 }}
                transition={{ duration: 0.36, delay: stagger + 0.08 + candidateIndex * 0.07, ease: "easeOut" }}
              >
                <motion.div
                  className="leader-bar"
                  initial={{ width: 0 }}
                  animate={{ width: isVisible ? `${Math.max(candidate.value, 2)}%` : 0 }}
                  transition={{ duration: 0.85, delay: stagger + 0.12 + candidateIndex * 0.07, ease: [0.22, 1, 0.36, 1] }}
                />
                <div className="leader-content">
                  <span className="leader-value">
                    {candidate.value < 1 ? "<1" : candidate.value}%
                  </span>
                  <span className="leader-avatar">{candidate.avatar ?? "?"}</span>
                  <span className="leader-label">{candidate.label}</span>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="card-hover-cta">
            <span>Open slate</span>
            <ArrowUpRight size={14} />
          </div>
        </>
      )}
    </RevealOnScroll>
  );
}
