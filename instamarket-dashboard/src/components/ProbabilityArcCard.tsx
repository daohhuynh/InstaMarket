import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { AnimatedGauge } from "./AnimatedGauge";
import { RevealOnScroll } from "./RevealOnScroll";
import type { MarketRecord } from "../types";

interface ProbabilityArcCardProps {
  market: MarketRecord;
  index?: number;
}

export function ProbabilityArcCard({ market, index = 0 }: ProbabilityArcCardProps) {
  const positive = market.change24h >= 0;
  const stagger = index * 0.06;

  return (
    <RevealOnScroll as="article" className="market-card arc-card decision-card" delay={stagger}>
      {({ isVisible }) => (
        <>
          <div className="market-card-header">
            <div className="market-icon">{market.icon}</div>
            <div>
              <h3>{market.title}</h3>
              <p>{market.category}</p>
            </div>
          </div>

          <AnimatedGauge
            value={market.probability}
            positive={positive}
            visible={isVisible}
            delay={stagger + 0.04}
          />

          <motion.div
            className="market-footer-line"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 6 }}
            transition={{ duration: 0.38, delay: stagger + 0.28, ease: "easeOut" }}
          >
            <span className={positive ? "up" : "down"}>
              {positive ? "+" : ""}
              {market.change24h.toFixed(1)} pts
            </span>
            <span>{market.volume} vol</span>
          </motion.div>

          <div className="card-hover-cta">
            <span>View scenario</span>
            <ArrowUpRight size={14} />
          </div>
        </>
      )}
    </RevealOnScroll>
  );
}
