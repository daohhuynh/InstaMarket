import { AnimatePresence, motion } from "framer-motion";
import { ElectionLeaderboardCard } from "./ElectionLeaderboardCard";
import { MiniSparklineCard } from "./MiniSparklineCard";
import { ProbabilityArcCard } from "./ProbabilityArcCard";
import type { MarketRecord } from "../types";

interface MarketCardGridProps {
  markets: MarketRecord[];
}

export function MarketCardGrid({ markets }: MarketCardGridProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={markets.map((market) => market.id).join("-")}
        className="market-grid"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {markets.map((market) => {
          if (market.chartVariant === "leaderboard") {
            return <ElectionLeaderboardCard key={market.id} market={market} />;
          }
          if (market.chartVariant === "arc") {
            return <ProbabilityArcCard key={market.id} market={market} />;
          }
          return <MiniSparklineCard key={market.id} market={market} />;
        })}
      </motion.section>
    </AnimatePresence>
  );
}
