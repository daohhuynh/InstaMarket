import { motion } from "framer-motion";
import { ArrowUpRight, ShieldCheck, Wallet } from "lucide-react";
import { useMemo } from "react";
import { AnimatedMetric } from "./AnimatedMetric";
import type { LinkedAccountState, MarketRecord, PortfolioPosition } from "../types";

interface PortfolioViewProps {
  positions: PortfolioPosition[];
  markets: Record<string, MarketRecord>;
  linkedAccount?: LinkedAccountState | null;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelative(value: string) {
  if (!value) return "now";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const deltaMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
    const hours = Math.round(deltaMinutes / 60);
    return `${hours}h ago`;
  } catch {
    return value;
  }
}

export function PortfolioView({ positions, markets, linkedAccount: _linkedAccount }: PortfolioViewProps) {
  const rows = useMemo(
    () =>
      positions
        .map((position) => {
          const market = markets[position.marketId];
          if (!market) return null;

          const entryPrice =
            position.side === "YES"
              ? position.entryProbability
              : 100 - position.entryProbability;
          const currentPrice =
            position.side === "YES" ? market.probability : 100 - market.probability;
          const shares = position.sizeUsd / Math.max(entryPrice / 100, 0.01);
          const currentValue = shares * (currentPrice / 100);
          const pnlUsd = currentValue - position.sizeUsd;
          const pnlPct = (pnlUsd / Math.max(position.sizeUsd, 1)) * 100;

          return {
            id: position.id,
            question: market.title,
            side: position.side,
            amount: position.sizeUsd,
            placedAt: position.openedAt,
            thesis: position.thesis,
            pnlUsd,
            pnlPct,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [markets, positions],
  );

  const betCount = rows.length;
  const yesCount = rows.filter((row) => row.side === "YES").length;
  const noCount = rows.filter((row) => row.side === "NO").length;
  const marketCount = new Set(rows.map((row) => row.question)).size;
  const totalValue = rows.reduce((sum, row) => sum + row.amount + row.pnlUsd, 0);
  const totalPnl = rows.reduce((sum, row) => sum + row.pnlUsd, 0);

  return (
    <section className="portfolio-view">
      <div className="view-hero">
        <div>
          <div className="section-kicker">Capital monitor</div>
          <h1>My Portfolio</h1>
          <p className="view-copy">
            Standalone dashboard portfolio activity with live mark-to-market PnL,
            execution history, and sizing context across your tracked markets.
          </p>
        </div>
        <div className="view-hero-badge">
          <Wallet size={18} />
          <span>Dashboard demo mode</span>
        </div>
      </div>

      <div className="summary-grid summary-grid-four">
        <article className="summary-card">
          <span>Live portfolio activity</span>
          <strong>
            <AnimatedMetric value={betCount} decimals={0} suffix=" bets" />
          </strong>
          <small>{marketCount} markets</small>
        </article>
        <article className="summary-card">
          <span>YES bets</span>
          <strong className="up">{yesCount}</strong>
          <small>risk-on side count</small>
        </article>
        <article className="summary-card">
          <span>NO bets</span>
          <strong className="down">{noCount}</strong>
          <small>hedge side count</small>
        </article>
        <article className="summary-card">
          <span>Marked capital</span>
          <strong>{formatUsd(totalValue)}</strong>
          <small className={totalPnl >= 0 ? "up" : "down"}>
            {totalPnl >= 0 ? "+" : ""}
            {formatUsd(totalPnl)} today
          </small>
        </article>
      </div>

      <div className="view-section-heading">
        <div>
          <div className="section-kicker">Recent bets</div>
          <h2>Execution tape</h2>
        </div>
        <p>Standalone execution history for the dashboard terminal.</p>
      </div>

      {rows.length ? (
        <div className="portfolio-list">
          {rows.map((row, index) => (
            <motion.article
              key={row.id}
              className="portfolio-row"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.05, ease: "easeOut" }}
            >
              <div className="portfolio-row-main">
                <div className="portfolio-row-title">
                  <div className="market-icon">IM</div>
                  <div>
                    <h3>{row.question}</h3>
                    <p>{row.thesis}</p>
                  </div>
                </div>

                <div className="portfolio-pill-row">
                  <span className={`side-pill ${row.side === "YES" ? "is-yes" : "is-no"}`}>
                    {row.side}
                  </span>
                  <span className="soft-pill">
                    <ShieldCheck size={14} />
                    {formatUsd(row.amount)} deployed
                  </span>
                  <span className="soft-pill">{formatRelative(row.placedAt)}</span>
                </div>
              </div>

              <div className="portfolio-metrics-grid">
                <div>
                  <span>Amount</span>
                  <strong>{formatUsd(row.amount)}</strong>
                </div>
                <div>
                  <span>Side</span>
                  <strong className={row.side === "YES" ? "up" : "down"}>{row.side}</strong>
                </div>
                <div>
                  <span>Placed</span>
                  <strong>{formatRelative(row.placedAt)}</strong>
                </div>
                <div>
                  <span>Live PnL</span>
                  <strong className={row.pnlUsd >= 0 ? "up" : "down"}>
                    {row.pnlUsd >= 0 ? "+" : ""}
                    {formatUsd(row.pnlUsd)}
                  </strong>
                </div>
              </div>

              <div className="portfolio-row-footer">
                <span className={row.pnlPct >= 0 ? "up" : "down"}>
                  {row.pnlPct >= 0 ? "+" : ""}
                  {row.pnlPct.toFixed(1)}% marked move
                </span>
                <span className="card-cta">
                  View details
                  <ArrowUpRight size={14} />
                </span>
              </div>
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="empty-linked-state">
          <strong>No portfolio data yet</strong>
          <span>Your dashboard portfolio will populate from the local market simulation data.</span>
        </div>
      )}
    </section>
  );
}