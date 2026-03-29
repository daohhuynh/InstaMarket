import { motion } from "framer-motion";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { useMemo } from "react";
import type { LinkedAccountState, MarketRecord, SavedMarketEntry } from "../types";

interface SavedMarketsViewProps {
  entries: SavedMarketEntry[];
  markets: Record<string, MarketRecord>;
  linkedAccount?: LinkedAccountState | null;
}

function formatDelta(current: number, previous: number) {
  const delta = current - previous;
  return {
    value: delta,
    label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`,
  };
}

export function SavedMarketsView({ entries, markets, linkedAccount: _linkedAccount }: SavedMarketsViewProps) {
  const rows = useMemo(
    () =>
      entries
        .map((entry) => {
          const market = markets[entry.marketId];
          if (!market) return null;
          return {
            id: entry.id,
            question: market.title,
            savedAt: entry.savedAt,
            savedProbability: entry.savedProbability,
            currentProbability: market.probability,
            volume: market.volume,
            note: entry.note,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [entries, markets],
  );

  const positiveCount = rows.filter((row) => row.currentProbability >= row.savedProbability).length;
  const averageMove = rows.length
    ? rows.reduce((sum, row) => sum + Math.abs(row.currentProbability - row.savedProbability), 0) / rows.length
    : 0;

  return (
    <section className="saved-view">
      <div className="view-hero">
        <div>
          <div className="section-kicker">Watchlist intelligence</div>
          <h1>Saved</h1>
          <p className="view-copy">
            Standalone saved-market watchlist for the dashboard terminal, tracking
            drift, liquidity, and follow-up trade opportunities.
          </p>
        </div>
        <div className="view-hero-badge">
          <Bookmark size={18} />
          <span>Dashboard watchlist</span>
        </div>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <span>Tracked markets</span>
          <strong>{rows.length}</strong>
          <small>saved in the dashboard</small>
        </article>
        <article className="summary-card">
          <span>Positive drift</span>
          <strong className="up">{positiveCount}</strong>
          <small>moving in your favor</small>
        </article>
        <article className="summary-card">
          <span>Average move</span>
          <strong>{averageMove.toFixed(1)} pts</strong>
          <small>vs saved odds</small>
        </article>
      </div>

      <div className="view-section-heading">
        <div>
          <div className="section-kicker">Saved markets</div>
          <h2>Watchlist board</h2>
        </div>
        <p>Standalone watchlist board for the dashboard terminal.</p>
      </div>

      {rows.length ? (
        <div className="saved-grid">
          {rows.map((row, index) => {
            const delta = formatDelta(row.currentProbability, row.savedProbability);
            return (
              <motion.article
                key={row.id}
                className="saved-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: index * 0.05, ease: "easeOut" }}
              >
                <div className="saved-card-head">
                  <div className="market-icon">IM</div>
                  <div>
                    <h3>{row.question}</h3>
                    <p>{row.note}</p>
                  </div>
                </div>

                <div className="saved-card-signal">
                  <div>
                    <span>Saved / current</span>
                    <strong>
                      {row.savedProbability.toFixed(1)}% / {row.currentProbability.toFixed(1)}%
                    </strong>
                  </div>
                  <div>
                    <span>Delta</span>
                    <strong className={delta.value >= 0 ? "up" : "down"}>{delta.label}</strong>
                  </div>
                </div>

                <div className="saved-card-meta">
                  <span className="soft-pill">{row.savedAt}</span>
                  <span className="soft-pill">{row.volume}</span>
                </div>

                <div className="saved-card-footer">
                  <span className={delta.value >= 0 ? "up" : "down"}>
                    {delta.value >= 0 ? "Working in your favor" : "Needs follow-up"}
                  </span>
                  <span className="card-cta">
                    Trade now
                    <ArrowUpRight size={14} />
                  </span>
                </div>
              </motion.article>
            );
          })}
        </div>
      ) : (
        <div className="empty-linked-state">
          <strong>No saved markets yet</strong>
          <span>Saved markets will appear here from the dashboard demo flow.</span>
        </div>
      )}
    </section>
  );
}