import { Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface TopCategoryNavProps {
  categories: string[];
  activeCategory: string;
  ticker: string[];
}

export function TopCategoryNav({
  categories,
  activeCategory,
  ticker,
}: TopCategoryNavProps) {
  return (
    <header className="top-shell">
      <div className="top-nav">
        <div className="wordmark">
          <div className="wordmark-mark">IM</div>
          <div>
            <div className="wordmark-title">InstaMarket</div>
            <div className="wordmark-subtitle">Prediction market terminal</div>
          </div>
        </div>

        <nav className="category-strip" aria-label="Global categories">
          {categories.map((category) => (
            <button
              key={category}
              className={`category-pill ${
                category === activeCategory ? "is-active" : ""
              }`}
              type="button"
            >
              {category}
            </button>
          ))}
        </nav>

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
          <motion.div
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 26, ease: "linear", repeat: Infinity }}
            className="ticker-loop"
          >
            {[...ticker, ...ticker].map((item, index) => (
              <span key={`${item}-${index}`} className="ticker-item">
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </div>
    </header>
  );
}
