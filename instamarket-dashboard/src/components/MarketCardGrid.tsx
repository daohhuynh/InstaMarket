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
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {markets.map((market, index) => {
          if (market.chartVariant === "leaderboard") {
            return <ElectionLeaderboardCard key={market.id} market={market} index={index} />;
          }
          if (market.chartVariant === "arc") {
            return <ProbabilityArcCard key={market.id} market={market} index={index} />;
          }
          return <MiniSparklineCard key={market.id} market={market} index={index} />;
        })}
      </motion.section>
    </AnimatePresence>
  );
}
