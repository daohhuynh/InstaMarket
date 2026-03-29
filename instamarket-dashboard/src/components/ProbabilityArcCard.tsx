import { motion } from "framer-motion";
import { AnimatedMetric } from "./AnimatedMetric";
import type { MarketRecord } from "../types";

interface ProbabilityArcCardProps {
  market: MarketRecord;
}

export function ProbabilityArcCard({ market }: ProbabilityArcCardProps) {
  const progress = Math.max(0, Math.min(100, market.probability));
  const circumference = 282.6;
  const offset = circumference - (progress / 100) * circumference;
  const positive = market.change24h >= 0;

  return (
    <motion.article className="market-card arc-card" whileHover={{ y: -4 }}>
      <div className="market-card-header">
        <div className="market-icon">{market.icon}</div>
        <div>
          <h3>{market.title}</h3>
          <p>{market.category}</p>
        </div>
      </div>

      <div className="arc-wrap">
        <svg viewBox="0 0 120 76" className="arc-svg">
          <path
            d="M 12 64 A 48 48 0 0 1 108 64"
            fill="none"
            stroke="rgba(88, 100, 120, 0.22)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <motion.path
            d="M 12 64 A 48 48 0 0 1 108 64"
            fill="none"
            stroke={positive ? "#3fba6a" : "#e24848"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>

        <div className="arc-center">
          <AnimatedMetric value={market.probability} suffix="%" className="arc-value" />
          <span>Chance</span>
        </div>
      </div>

      <div className="market-footer-line">
        <span className={positive ? "up" : "down"}>
          {positive ? "+" : ""}
          {market.change24h.toFixed(1)} pts
        </span>
        <span>{market.volume} vol</span>
      </div>
    </motion.article>
  );
}
