import { startTransition, useEffect, useMemo, useState } from "react";
import { dashboardData } from "../data/mockDashboard";
import type {
  ActivityEvent,
  ChartPoint,
  DashboardData,
  DashboardTopicId,
  MarketRecord,
} from "../types";

function nudge(value: number, index: number, amplitude: number, min: number, max: number) {
  const wave = Math.sin(Date.now() / 3400 + index * 0.63) * amplitude;
  return Math.max(min, Math.min(max, Number((value + wave).toFixed(1))));
}

function driftSeries(points: ChartPoint[], marketIndex: number): ChartPoint[] {
  return points.map((point, index) => {
    const tilt = Math.sin(Date.now() / 3000 + marketIndex + index * 0.21) * 0.95;
    const micro = Math.cos(Date.now() / 1800 + index * 0.41) * 0.45;
    return {
      ...point,
      probability: Math.max(
        2,
        Math.min(98, Number((point.probability + tilt + micro).toFixed(1))),
      ),
      volume: Math.max(100, Math.round(point.volume + tilt * 24 + micro * 12)),
    };
  });
}

function driftMarket(market: MarketRecord, index: number): MarketRecord {
  const series = driftSeries(market.chartPoints, index);
  const last = series[series.length - 1]?.probability ?? market.probability;
  const first = series[0]?.probability ?? market.probability;
  return {
    ...market,
    chartPoints: series,
    probability: Number(last.toFixed(1)),
    change24h: Number((last - first).toFixed(1)),
    confidence: Math.round(nudge(market.confidence, index, 1.4, 52, 93)),
  };
}

function rotateActivity(
  events: ActivityEvent[],
  topic: DashboardTopicId,
): ActivityEvent[] {
  const liveLabels: Record<DashboardTopicId, string[]> = {
    ai: [
      "Parser upgraded AI launch confidence",
      "Persona sim split widened on regulation market",
      "Saved AI market converted into fresh YES entry",
    ],
    macro: [
      "Rates basket repriced after soft macro pulse",
      "Saved macro board triggered re-entry alert",
      "Risk filter downgraded GDP downside tape",
    ],
    elections: [
      "Leader board compressed into late volatility",
      "Manual review upgraded election slate confidence",
      "Parser flagged fresh map divergence",
    ],
    crypto: [
      "Narrative tape accelerated on majors basket",
      "Bedrock filtered meme spike into clean NO fade",
      "Crypto feed confidence lifted into close",
    ],
  };

  const newestLabel =
    liveLabels[topic][Math.floor(Date.now() / 4000) % liveLabels[topic].length];
  const newest: ActivityEvent = {
    id: `${topic}-${Date.now()}`,
    type: "signal",
    label: newestLabel,
    timestamp: "now",
    direction: Math.sin(Date.now() / 2500) > 0 ? "up" : "down",
    amount: `${Math.round(60 + Math.abs(Math.sin(Date.now() / 2000)) * 28)} conf`,
    source: topic === "crypto" ? "Bedrock" : "Parser",
  };

  return [newest, ...events].slice(0, 6);
}

export function useLiveDashboard() {
  const [liveData, setLiveData] = useState<DashboardData>(dashboardData);

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        setLiveData((current) => {
          const nextMarkets = Object.fromEntries(
            Object.entries(current.markets).map(([key, market], index) => [
              key,
              driftMarket(market, index),
            ]),
          );

          const nextSources = Object.fromEntries(
            Object.entries(current.sourceMetrics).map(([topic, metrics]) => [
              topic,
              metrics.map((metric, index) => ({
                ...metric,
                winRate: Math.round(nudge(metric.winRate, index, 1.1, 44, 88)),
                confidence: Math.round(
                  nudge(metric.confidence, index + 2, 1.2, 52, 90),
                ),
                conversion: Math.round(
                  nudge(metric.conversion, index + 4, 1.5, 14, 52),
                ),
                edgeCaptured: Number(
                  nudge(metric.edgeCaptured, index + 1, 0.35, 1.8, 12.5).toFixed(1),
                ),
                trendPoints: metric.trendPoints.map((point, pointIndex) =>
                  nudge(point, pointIndex + index, 1.2, 24, 92),
                ),
              })),
            ]),
          ) as DashboardData["sourceMetrics"];

          const nextActivity = Object.fromEntries(
            Object.entries(current.activityByTopic).map(([topic, events]) => [
              topic,
              rotateActivity(events, topic as DashboardTopicId),
            ]),
          ) as DashboardData["activityByTopic"];

          return {
            ...current,
            markets: nextMarkets,
            sourceMetrics: nextSources,
            activityByTopic: nextActivity,
            breakingTicker: current.breakingTicker.map((line, index) =>
              index === 0
                ? `Live tape ${Math.round(
                    60 + Math.abs(Math.sin(Date.now() / 2800 + index)) * 39,
                  )}: ${line}`
                : line,
            ),
          };
        });
      });
    }, 2500);

    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => liveData, [liveData]);
}
