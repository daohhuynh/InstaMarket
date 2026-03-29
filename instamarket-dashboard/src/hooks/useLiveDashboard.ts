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

function formatRelativeAge(step: number) {
  if (step <= 0) return "now";
  const seconds = step * 18;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `${minutes}m ago` : `${minutes}m ${remaining}s ago`;
}

function ageEvents(events: ActivityEvent[]) {
  return events.map((event, index) => ({
    ...event,
    timestamp: formatRelativeAge(index + 1),
  }));
}

function buildBreakingTicker(markets: Record<string, MarketRecord>) {
  const leaders = Object.values(markets)
    .sort((left, right) => Math.abs(right.change24h) - Math.abs(left.change24h))
    .slice(0, 5);

  return leaders.map((market) => {
    const direction = market.change24h >= 0 ? "+" : "-";
    const normalizedMove = Math.abs(market.change24h).toFixed(1);
    return `${market.shortLabel} ${direction}${normalizedMove} pts at ${market.probability.toFixed(1)}%`;
  });
}

function buildActivityEvent(
  topic: DashboardTopicId,
  markets: Record<string, MarketRecord>,
  pulse: number,
): ActivityEvent {
  const topicDefinition = dashboardData.topics.find((entry) => entry.id === topic);
  const topicMarkets = (topicDefinition?.marketIds ?? [])
    .map((marketId) => markets[marketId])
    .filter((market): market is MarketRecord => Boolean(market));

  const rankedMarkets = [...topicMarkets].sort(
    (left, right) => Math.abs(right.change24h) - Math.abs(left.change24h),
  );
  const focusMarket = rankedMarkets[pulse % Math.max(rankedMarkets.length, 1)] ??
    Object.values(markets)[pulse % Math.max(Object.keys(markets).length, 1)];
  const change = focusMarket?.change24h ?? 0;
  const direction: ActivityEvent["direction"] =
    change > 0.35 ? "up" : change < -0.35 ? "down" : "neutral";

  const sourceByTopic: Record<DashboardTopicId, string[]> = {
    ai: ["Bedrock", "Parser", "Benchmark feed", "Saved flow"],
    macro: ["Macro tape", "Manual", "Parser", "Rates feed"],
    elections: ["Electoral map", "Parser", "Manual review", "Crossfeed"],
    crypto: ["Bedrock", "X Feed", "Onchain", "Momentum desk"],
  };

  const templates: Record<DashboardTopicId, Array<(market: MarketRecord, move: string) => Omit<ActivityEvent, "id" | "timestamp">>> = {
    ai: [
      (market, move) => ({ type: "signal", direction, source: "Bedrock", amount: `${market.confidence} conf`, label: `${market.shortLabel} repriced ${move} on model benchmark chatter` }),
      (market, move) => ({ type: "bet", direction, source: "Saved flow", amount: `$${Math.round(700 + market.confidence * 9)}`, label: `Fresh ${change >= 0 ? "YES" : "NO"} flow hit ${market.shortLabel} after ${move}` }),
      (market) => ({ type: "save", direction: "neutral", source: "Watchlist", amount: "saved", label: `${market.shortLabel} moved into analyst queue for follow-up` }),
      (market, move) => ({ type: "swing", direction, source: "Benchmark feed", amount: `${move}`, label: `${market.shortLabel} led the AI board on cross-model spread widening` }),
    ],
    macro: [
      (market, move) => ({ type: "signal", direction, source: "Rates feed", amount: `${market.confidence} conf`, label: `${market.shortLabel} repriced ${move} after macro pulse` }),
      (market) => ({ type: "bet", direction, source: "Manual", amount: `$${Math.round(600 + market.confidence * 8)}`, label: `Desk added ${change >= 0 ? "risk" : "hedge"} into ${market.shortLabel}` }),
      (market) => ({ type: "save", direction: "neutral", source: "Saved", amount: "watch", label: `${market.shortLabel} parked for CPI and labor follow-through` }),
      (market, move) => ({ type: "swing", direction, source: "Macro tape", amount: `${move}`, label: `${market.shortLabel} pushed the macro board into a new range` }),
    ],
    elections: [
      (market, move) => ({ type: "signal", direction, source: "Parser", amount: `${market.confidence} conf`, label: `${market.shortLabel} map confidence shifted ${move}` }),
      (market) => ({ type: "bet", direction, source: "Manual review", amount: `$${Math.round(500 + market.confidence * 7)}`, label: `Election desk leaned ${change >= 0 ? "pro-candidate" : "fade"} on ${market.shortLabel}` }),
      (market) => ({ type: "save", direction: "neutral", source: "Saved", amount: "saved", label: `${market.shortLabel} moved onto the late-count watchlist` }),
      (market, move) => ({ type: "swing", direction, source: "Electoral map", amount: `${move}`, label: `${market.shortLabel} became the fastest mover on the slate` }),
    ],
    crypto: [
      (market, move) => ({ type: "signal", direction, source: "Onchain", amount: `${market.confidence} conf`, label: `${market.shortLabel} accelerated ${move} on onchain flow` }),
      (market) => ({ type: "bet", direction, source: "X Feed", amount: `$${Math.round(900 + market.confidence * 10)}`, label: `Momentum desk added ${change >= 0 ? "YES" : "NO"} on ${market.shortLabel}` }),
      (market) => ({ type: "save", direction: "neutral", source: "Saved", amount: "watch", label: `${market.shortLabel} clipped into the saved rotation` }),
      (market, move) => ({ type: "swing", direction, source: "Bedrock", amount: `${move}`, label: `${market.shortLabel} triggered the strongest crypto swing in the last pulse` }),
    ],
  };

  const templateGroup = templates[topic];
  const template = templateGroup[pulse % templateGroup.length];
  const move = `${change >= 0 ? "+" : "-"}${Math.abs(change).toFixed(1)} pts`;
  const candidate = focusMarket ?? rankedMarkets[0];
  const base = template(candidate, move);

  return {
    ...base,
    id: `${topic}-${candidate.id}-${pulse}`,
    timestamp: "now",
    source: sourceByTopic[topic][pulse % sourceByTopic[topic].length] ?? base.source,
  };
}

function rotateActivity(
  events: ActivityEvent[],
  topic: DashboardTopicId,
  markets: Record<string, MarketRecord>,
  pulse: number,
): ActivityEvent[] {
  const newest = buildActivityEvent(topic, markets, pulse);
  return [newest, ...ageEvents(events)].slice(0, 8);
}

export function useLiveDashboard() {
  const [liveData, setLiveData] = useState<DashboardData>(dashboardData);

  useEffect(() => {
    let pulse = 0;

    const id = window.setInterval(() => {
      pulse += 1;
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
            Object.entries(current.activityByTopic).map(([topic, events], topicIndex) => [
              topic,
              rotateActivity(
                events,
                topic as DashboardTopicId,
                nextMarkets,
                pulse + topicIndex,
              ),
            ]),
          ) as DashboardData["activityByTopic"];

          return {
            ...current,
            markets: nextMarkets,
            sourceMetrics: nextSources,
            activityByTopic: nextActivity,
            breakingTicker: buildBreakingTicker(nextMarkets),
          };
        });
      });
    }, 2200);

    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => liveData, [liveData]);
}


