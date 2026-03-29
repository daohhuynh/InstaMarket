import { Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

interface TopCategoryNavProps {
  activeCategory: string;
  ticker: string[];
}

function parseTicker(item: string) {
  const deltaMatch = item.match(/([+-]\d+(?:\.\d+)?)\s*(pts|%|c|conf)?/i);
  const delta = deltaMatch?.[1] ?? null;
  const unit = deltaMatch?.[2] ?? "";
  const trend = delta?.startsWith("-") ? "down" : "up";

  return {
    item,
    delta: delta ? `${delta}${unit ? ` ${unit}` : ""}` : null,
    trend,
  } as const;
}

export function TopCategoryNav({ activeCategory, ticker }: TopCategoryNavProps) {
  const loop = [...ticker, ...ticker];

  return (
    <header className="top-shell">
      <div className="top-nav top-nav-condensed">
        <div className="wordmark">
          <div className="wordmark-mark">IM</div>
          <div>
            <div className="wordmark-title">InstaMarket</div>
            <div className="wordmark-subtitle">Prediction market terminal</div>
          </div>
        </div>

        <div className="header-focus-pill" aria-label="Active focus">
          <span className="header-focus-label">Focus</span>
          <strong>{activeCategory}</strong>
        </div>

        <div className="command-bar">
          <Search size={16} />
          <span>Search markets, source signals, thesis...</span>
          <kbd>/</kbd>
        </div>
      </div>

      <div className="ticker-rail">
        <div className="ticker-badge">
          <Sparkles size={14} />
          Live tape
        </div>
        <div className="ticker-track">
          <div className="ticker-marquee">
            {loop.map((item, index) => {
              const parsed = parseTicker(item);
              const isUp = parsed.trend === "up";
              return (
                <article
                  key={`${item}-${index}`}
                  className={`ticker-card ${isUp ? "is-up" : "is-down"}`}
                >
                  <span className={`ticker-trend ${isUp ? "is-up" : "is-down"}`}>
                    {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  </span>
                  <div className="ticker-copy">
                    <strong>{item}</strong>
                    <span>Cross-market signal pulse</span>
                  </div>
                  {parsed.delta ? (
                    <span className={`ticker-delta ${isUp ? "is-up" : "is-down"}`}>
                      {parsed.delta}
                    </span>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
