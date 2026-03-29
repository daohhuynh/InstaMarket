import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AnimatedMetric } from "./AnimatedMetric";
import type { SourceMetric } from "../types";

interface SourceAttributionPanelProps {
  copy: string;
  metrics: SourceMetric[];
}

export function SourceAttributionPanel({
  copy,
  metrics,
}: SourceAttributionPanelProps) {
  return (
    <section className="source-panel">
      <div className="section-heading-row">
        <div>
          <div className="section-kicker">Alpha intelligence</div>
          <h2>Where alpha came from</h2>
        </div>
        <p>{copy}</p>
      </div>

      <div className="source-grid">
        {metrics.map((metric) => (
          <motion.article
            key={metric.source}
            className="source-card"
            whileHover={{ y: -3 }}
          >
            <div className="source-card-header">
              <div className="source-title">{metric.source}</div>
              <div className="source-badge" style={{ color: metric.accent }}>
                <AnimatedMetric value={metric.winRate} suffix="%" />
              </div>
            </div>

            <div className="source-metrics">
              <div>
                <span>Edge</span>
                <strong>
                  <AnimatedMetric value={metric.edgeCaptured} decimals={1} suffix=" pts" />
                </strong>
              </div>
              <div>
                <span>Bets</span>
                <strong>{metric.bets}</strong>
              </div>
              <div>
                <span>Conversion</span>
                <strong>
                  <AnimatedMetric value={metric.conversion} suffix="%" />
                </strong>
              </div>
            </div>

            <div className="source-trend">
              <ResponsiveContainer width="100%" height={74}>
                <AreaChart
                  data={metric.trendPoints.map((point, index) => ({
                    index,
                    point,
                  }))}
                >
                  <defs>
                    <linearGradient
                      id={`source-fill-${metric.source}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={metric.accent} stopOpacity={0.42} />
                      <stop offset="95%" stopColor={metric.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="point"
                    stroke={metric.accent}
                    fill={`url(#source-fill-${metric.source})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <p className="source-thesis">{metric.thesis}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
