import { AnimatedSparkline } from "./AnimatedSparkline";
import { AnimatedMetric } from "./AnimatedMetric";
import { RevealOnScroll } from "./RevealOnScroll";
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
        {metrics.map((metric, index) => (
          <RevealOnScroll key={metric.source} as="article" className="source-card" delay={index * 0.06}>
            {({ isVisible }) => (
              <>
                <div className="source-card-header">
                  <div className="source-title">{metric.source}</div>
                  <div className="source-badge" style={{ color: metric.accent }}>
                    <AnimatedMetric value={metric.winRate} suffix="%" start={isVisible} delay={index * 0.06 + 0.08} />
                  </div>
                </div>

                <div className="source-metrics">
                  <div>
                    <span>Edge</span>
                    <strong>
                      <AnimatedMetric value={metric.edgeCaptured} decimals={1} suffix=" pts" start={isVisible} delay={index * 0.06 + 0.12} />
                    </strong>
                  </div>
                  <div>
                    <span>Bets</span>
                    <strong>
                      <AnimatedMetric value={metric.bets} start={isVisible} delay={index * 0.06 + 0.16} />
                    </strong>
                  </div>
                  <div>
                    <span>Conversion</span>
                    <strong>
                      <AnimatedMetric value={metric.conversion} suffix="%" start={isVisible} delay={index * 0.06 + 0.2} />
                    </strong>
                  </div>
                </div>

                <AnimatedSparkline
                  points={metric.trendPoints.map((point, pointIndex) => ({
                    time: String(pointIndex),
                    label: String(pointIndex),
                    probability: point,
                    volume: point,
                  }))}
                  id={`source-${metric.source}`}
                  strokeColor={metric.accent}
                  fillColor={metric.accent}
                  height={74}
                  visible={isVisible}
                  delay={index * 0.06 + 0.08}
                />

                <p className="source-thesis">{metric.thesis}</p>
              </>
            )}
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}
