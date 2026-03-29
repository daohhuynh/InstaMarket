import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useMemo, useState } from "react";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { HeroMarketPanel } from "./components/HeroMarketPanel";
import { LiveActivityTape } from "./components/LiveActivityTape";
import { MarketCardGrid } from "./components/MarketCardGrid";
import { SourceAttributionPanel } from "./components/SourceAttributionPanel";
import { TopCategoryNav } from "./components/TopCategoryNav";
import { useLinkedAccountData } from "./hooks/useLinkedAccountData";
import { useLiveDashboard } from "./hooks/useLiveDashboard";
import type { DashboardTopicId, DashboardViewId } from "./types";

const PortfolioView = lazy(() =>
  import("./components/PortfolioView").then((module) => ({ default: module.PortfolioView })),
);
const SavedMarketsView = lazy(() =>
  import("./components/SavedMarketsView").then((module) => ({
    default: module.SavedMarketsView,
  })),
);

function ViewSkeleton() {
  return (
    <div className="view-skeleton" aria-hidden="true">
      <div className="view-skeleton-hero" />
      <div className="view-skeleton-grid">
        <div className="view-skeleton-card" />
        <div className="view-skeleton-card" />
        <div className="view-skeleton-card" />
      </div>
      <div className="view-skeleton-list">
        <div className="view-skeleton-row" />
        <div className="view-skeleton-row" />
      </div>
    </div>
  );
}

export default function App() {
  const data = useLiveDashboard();
  const linkedAccount = useLinkedAccountData();
  const [activeTopic, setActiveTopic] = useState<DashboardTopicId>("ai");
  const [activeView, setActiveView] = useState<DashboardViewId>("dashboard");

  const topic = useMemo(
    () => data.topics.find((entry) => entry.id === activeTopic) ?? data.topics[0],
    [activeTopic, data.topics],
  );

  const heroMarket = data.markets[topic.heroMarketId];
  const topicMarkets = topic.marketIds.map((marketId) => data.markets[marketId]);
  const secondaryMarkets = topicMarkets.filter((market) => market.id !== heroMarket.id);
  const sourceMetrics = data.sourceMetrics[topic.id];
  const activity = data.activityByTopic[topic.id];
  const portfolioCount = linkedAccount.connected
    ? linkedAccount.portfolio.recentBets.length
    : data.portfolioPositions.length;
  const savedCount = linkedAccount.connected
    ? linkedAccount.savedMarkets.length
    : data.savedMarkets.length;

  return (
    <div className="app-shell">
      <TopCategoryNav        activeCategory={topic.topCategory}
        ticker={data.breakingTicker}
      />

      <main className="dashboard-shell">
        <DashboardSidebar
          topics={data.topics}
          activeTopic={topic.id}
          activeView={activeView}
          portfolioCount={portfolioCount}
          savedCount={savedCount}
          onSelect={setActiveTopic}
          onSelectView={setActiveView}
        />

        <section className="dashboard-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeView}-${topic.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {activeView === "dashboard" ? (
                <>
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
                </>
              ) : (
                <Suspense fallback={<ViewSkeleton />}>
                  {activeView === "portfolio" ? (
                    <PortfolioView
                      positions={data.portfolioPositions}
                      markets={data.markets}
                      linkedAccount={linkedAccount}
                    />
                  ) : (
                    <SavedMarketsView
                      entries={data.savedMarkets}
                      markets={data.markets}
                      linkedAccount={linkedAccount}
                    />
                  )}
                </Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}

