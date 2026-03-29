import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { AnimatedMetric } from "./AnimatedMetric";
import type { MarketRecord } from "../types";

interface MiniSparklineCardProps {
  market: MarketRecord;
}

export function MiniSparklineCard({ market }: MiniSparklineCardProps) {
  const positive = market.change24h >= 0;
  const strokeColor = positive ? "#4ab36e" : "#d9dde5";
  const fillColor = positive ? "#4ab36e" : "#d9dde5";

  return (
    <motion.article className="market-card spark-card" whileHover={{ y: -4 }}>
      <div className="market-card-header">
        <div className="market-icon">{market.icon}</div>
        <div>
          <h3>{market.title}</h3>
          <p>{market.sourceBias}</p>
        </div>
      </div>

      <div className="market-quick-metrics">
        <AnimatedMetric value={market.probability} suffix="%" className="market-large-value" />
        <span className={positive ? "up" : "down"}>
          {positive ? "+" : ""}
          {market.change24h.toFixed(1)} pts
        </span>
      </div>

      <div className="mini-chart">
        <ResponsiveContainer width="100%" height={92}>
          <AreaChart data={market.chartPoints}>
            <defs>
              <linearGradient id={`fill-${market.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={fillColor} stopOpacity={0.34} />
                <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{
                background: "rgba(10, 15, 24, 0.98)",
                border: "1px solid rgba(96, 126, 164, 0.2)",
                borderRadius: "14px",
              }}
            />
            <Area
              type="monotone"
              dataKey="probability"
              stroke={strokeColor}
              fill={`url(#fill-${market.id})`}
              strokeWidth={2.4}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="market-footer-line">
        <span>{market.momentumLabel}</span>
        <span>{market.liquidity}</span>
      </div>
    </motion.article>
  );
}
