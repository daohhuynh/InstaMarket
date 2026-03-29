import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { HeroMarketPanel } from "./components/HeroMarketPanel";
import { LiveActivityTape } from "./components/LiveActivityTape";
import { MarketCardGrid } from "./components/MarketCardGrid";
import { SourceAttributionPanel } from "./components/SourceAttributionPanel";
import { TopCategoryNav } from "./components/TopCategoryNav";
import { useLiveDashboard } from "./hooks/useLiveDashboard";
import type { DashboardTopicId } from "./types";

export default function App() {
  const data = useLiveDashboard();
  const [activeTopic, setActiveTopic] = useState<DashboardTopicId>("ai");

  const topic = useMemo(
    () => data.topics.find((entry) => entry.id === activeTopic) ?? data.topics[0],
    [activeTopic, data.topics],
  );

  const heroMarket = data.markets[topic.heroMarketId];
  const topicMarkets = topic.marketIds.map((marketId) => data.markets[marketId]);
  const secondaryMarkets = topicMarkets.filter((market) => market.id !== heroMarket.id);
  const sourceMetrics = data.sourceMetrics[topic.id];
  const activity = data.activityByTopic[topic.id];

  return (
    <div className="app-shell">
      <TopCategoryNav
        categories={data.topNavCategories}
        activeCategory={topic.topCategory}
        ticker={data.breakingTicker}
      />

      <main className="dashboard-shell">
        <DashboardSidebar
          topics={data.topics}
          activeTopic={topic.id}
          onSelect={setActiveTopic}
        />

        <section className="dashboard-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={topic.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <HeroMarketPanel
                title={topic.label}
                subtitle={topic.heroHeadline}
                market={heroMarket}
              />

              <div className="section-heading-row">
                <div>
                  <div className="section-kicker">Market board</div>
                  <h2>Secondary markets</h2>
                </div>
                <p>
                  Hover into the board for fuller readouts, live-feeling charts,
                  and constantly shifting market posture.
                </p>
              </div>

              <MarketCardGrid markets={secondaryMarkets} />

              <div className="lower-layout">
                <SourceAttributionPanel
                  copy={topic.sourceCopy}
                  metrics={sourceMetrics}
                />
                <LiveActivityTape events={activity} />
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
