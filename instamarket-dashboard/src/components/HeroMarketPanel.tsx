import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import { AnimatedMetric } from "./AnimatedMetric";
import { LiveLineChart } from "./LiveLineChart";
import type { MarketRecord } from "../types";

interface HeroMarketPanelProps {
  title: string;
  subtitle: string;
  market: MarketRecord;
}

export function HeroMarketPanel({
  title,
  subtitle,
  market,
}: HeroMarketPanelProps) {
  const positive = market.change24h >= 0;

  return (
    <motion.section
      className="hero-panel"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="hero-copy">
        <div>
          <div className="section-kicker">{subtitle}</div>
          <h1>{title}</h1>
        </div>
        <div className="hero-brand-fade">InstaMarket</div>
      </div>

      <div className="hero-market-head">
        <div className="hero-market-title-group">
          <div className="hero-market-icon">{market.icon}</div>
          <div>
            <div className="hero-market-title">{market.title}</div>
            <div className="hero-market-subtitle">
              {market.sourceBias} · {market.narrative}
            </div>
          </div>
        </div>

        <div className="hero-market-stats">
          <div className="hero-probability">
            <AnimatedMetric
              className="hero-probability-value"
              value={market.probability}
              suffix="%"
            />
            <span className="hero-probability-label">chance</span>
          </div>
          <div className={`hero-change ${positive ? "up" : "down"}`}>
            {positive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            <AnimatedMetric
              value={Math.abs(market.change24h)}
              prefix={positive ? "+" : "-"}
              suffix=" pts"
              decimals={1}
            />
          </div>
        </div>
      </div>

      <div className="hero-metric-grid">
        <div className="metric-box">
          <span>Volume</span>
          <strong>{market.volume}</strong>
        </div>
        <div className="metric-box">
          <span>Liquidity</span>
          <strong>{market.liquidity}</strong>
        </div>
        <div className="metric-box">
          <span>Confidence</span>
          <strong>
            <AnimatedMetric value={market.confidence} suffix="%" />
          </strong>
        </div>
        <div className="metric-box">
          <span>Momentum</span>
          <strong>{market.momentumLabel}</strong>
        </div>
      </div>

      <LiveLineChart points={market.chartPoints} />

      <div className="hero-tag-row">
        {market.tags.map((tag) => (
          <span key={tag} className="hero-tag">
            {tag}
          </span>
        ))}
      </div>
    </motion.section>
  );
}
