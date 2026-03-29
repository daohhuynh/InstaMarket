import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { AnimatedMetric } from "./AnimatedMetric";
import { AnimatedSparkline } from "./AnimatedSparkline";
import { RevealOnScroll } from "./RevealOnScroll";
import type { MarketRecord } from "../types";

interface MiniSparklineCardProps {
  market: MarketRecord;
  index?: number;
}

export function MiniSparklineCard({ market, index = 0 }: MiniSparklineCardProps) {
  const positive = market.change24h >= 0;
  const strokeColor = positive ? "#4ab36e" : "#d9dde5";
  const fillColor = positive ? "#4ab36e" : "#d9dde5";
  const stagger = index * 0.06;

  return (
    <RevealOnScroll as="article" className="market-card spark-card decision-card" delay={stagger}>
      {({ isVisible }) => (
        <>
          <div className="market-card-header">
            <div className="market-icon">{market.icon}</div>
            <div>
              <h3>{market.title}</h3>
              <p>{market.sourceBias}</p>
            </div>
          </div>

          <motion.div
            className="market-quick-metrics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 8 }}
            transition={{ duration: 0.45, delay: stagger + 0.08, ease: "easeOut" }}
          >
            <AnimatedMetric
              value={market.probability}
              suffix="%"
              className="market-large-value"
              start={isVisible}
              delay={stagger + 0.1}
            />
            <motion.span
              className={positive ? "up" : "down"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 6 }}
              transition={{ duration: 0.4, delay: stagger + 0.18, ease: "easeOut" }}
            >
              {positive ? "+" : ""}
              {market.change24h.toFixed(1)} pts
            </motion.span>
          </motion.div>

          <AnimatedSparkline
            points={market.chartPoints}
            id={market.id}
            strokeColor={strokeColor}
            fillColor={fillColor}
            visible={isVisible}
            delay={stagger + 0.08}
          />

          <motion.div
            className="market-footer-line"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 6 }}
            transition={{ duration: 0.38, delay: stagger + 0.24, ease: "easeOut" }}
          >
            <span>{market.momentumLabel}</span>
            <span>{market.liquidity}</span>
          </motion.div>

          <div className="card-hover-cta">
            <span>Trade / Details</span>
            <ArrowUpRight size={14} />
          </div>
        </>
      )}
    </RevealOnScroll>
  );
}
