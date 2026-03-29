// ============================================================
// INJECT.JS — entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  "use strict";

  let sidebarMounted = false;

  // ── Wait for DOM ready ──────────────────────────────────
  async function init() {
    mountSidebar();
    await hydrateMarketUniverse();
    observeTweets();
  }

  // ── Sidebar ─────────────────────────────────────────────
  function mountSidebar() {
    if (sidebarMounted) return;
    sidebarMounted = true;
    createSidebar();
    mountCollapseToggle();

    // Hide Twitter's right sidebar column (we replace it), but don't touch their floating buttons
    const style = document.createElement("style");
    style.textContent = `
      @media (min-width: 1280px) {
        main[role="main"] { margin-right: 380px !important; transition: margin-right 0.3s ease; }
        main[role="main"].im-sidebar-hidden { margin-right: 0 !important; }
        [data-testid="sidebarColumn"] { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountCollapseToggle() {
    if (document.getElementById("im-sidebar-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "im-sidebar-toggle";
    btn.title = "Collapse / expand InstaMarket sidebar";
    btn.innerHTML = "❯";
    btn.addEventListener("click", toggleSidebar);
    document.body.appendChild(btn);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById("im-sidebar");
    const toggle = document.getElementById("im-sidebar-toggle");
    const main = document.querySelector('main[role="main"]');
    const collapsed = sidebar.classList.toggle("im-collapsed");
    toggle.classList.toggle("im-collapsed", collapsed);
    toggle.innerHTML = collapsed ? "❮" : "❯";
    if (main) main.classList.toggle("im-sidebar-hidden", collapsed);
  }

  function readJsonLocalStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Tweet observation ────────────────────────────────────
  function observeTweets() {
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll(
          'article[data-testid="tweet"]:not([data-im-injected])',
        )
        .forEach((tweet) => {
          injectTweetLayer(tweet).catch((error) =>
            console.warn("[InstaMarket] Tweet injection error:", error),
          );
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Also run immediately on existing tweets
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach((tweet) => {
        injectTweetLayer(tweet).catch((error) =>
          console.warn("[InstaMarket] Tweet injection error:", error),
        );
      });
  }

  async function injectTweetLayer(tweet) {
    tweet.setAttribute("data-im-injected", "true");

    const tweetText = tweet.innerText;
    const match = await findBestMarketForTweetWithAi(tweetText);
    if (!match) return;
    const market = match.market;
    const researchSummary = buildResearchSummary(tweetText, match);
    persistResearch(market.id, researchSummary);
    const safeQuestion = escapeHtml(market.question);
    const safeVolume = escapeHtml(market.volume || "$0 Vol");
    const safeMarketId = escapeHtml(String(market.id));
    const safeMarketUrl = escapeHtml(market.polymarketUrl || "");

    const layer = document.createElement("div");
    layer.className = "im-tweet-layer";
    layer.innerHTML = `
      <div class="im-market-question">
        Market: <span>${safeQuestion}</span>
        <span class="im-match-confidence">· ${match.confidence}% ${match.source === "aws-bedrock" ? "AI" : "parser"} match</span>
      </div>
      <div class="im-tweet-actions">
        <div class="im-odds-pill">
          <span class="im-yes-pct">YES ${market.yesOdds}%</span>
          <span class="im-sep">|</span>
          <span class="im-no-pct">NO ${market.noOdds}%</span>
          <span class="im-sep">·</span>
          <span class="im-vol">${safeVolume}</span>
        </div>
        <button class="im-bet-yes" data-market="${safeMarketId}" data-side="YES">
          <span class="im-arrow-up"></span> YES
        </button>
        <button class="im-bet-no" data-market="${safeMarketId}" data-side="NO">
          <span class="im-arrow-down"></span> NO
        </button>
        <button class="im-save-btn" data-market="${safeMarketId}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
          Save
        </button>
        <button class="im-research-btn" data-market="${safeMarketId}">
          Research
        </button>
        <div class="im-pm-link" title="View on Polymarket" data-market-url="${safeMarketUrl}">
          <svg class="im-pm-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="2" fill="none"/>
          </svg>
        </div>
      </div>
    `;

    // Bet buttons → instant bet + show markets sidebar
    layer.querySelectorAll(".im-bet-yes, .im-bet-no").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const side = btn.dataset.side;
        const mId = btn.dataset.market;
        showToast(
          `Bet placed: ${side} on "${market.question.slice(0, 40)}…" ✓`,
        );
        if (typeof window.recordSidebarBet === "function") {
          window.recordSidebarBet(mId, side);
        }
        persistResearch(mId, researchSummary);
        switchSidebarToMarkets(mId);
      });
    });

    layer.querySelector(".im-save-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.saveMarketForLater === "function") {
        const saved = window.saveMarketForLater(market.id);
        showToast(
          saved
            ? `Saved: "${market.question.slice(0, 40)}…" ✓`
            : "Already saved.",
        );
        return;
      }
      showToast(`Saved: "${market.question.slice(0, 40)}…" ✓`);
    });

    layer.querySelector(".im-research-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      persistResearch(market.id, researchSummary);
      showToast(`Research ready: "${market.question.slice(0, 40)}…"`);
      switchSidebarToMarkets(market.id);
    });

    const pmLink = layer.querySelector(".im-pm-link");
    pmLink?.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetUrl = pmLink.getAttribute("data-market-url");
      if (targetUrl) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
    });

    // Insert after the tweet's action row
    const actionRow = tweet.querySelector('[role="group"]');
    if (actionRow && actionRow.parentNode) {
      actionRow.parentNode.insertBefore(layer, actionRow.nextSibling);
    } else {
      tweet.appendChild(layer);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function persistResearch(marketId, payload) {
    if (typeof setMarketResearch === "function") {
      setMarketResearch(marketId, payload);
    }
  }

  async function hydrateMarketUniverse() {
    if (typeof loadPolymarketMarketUniverse !== "function") {
      return;
    }
    try {
      const result = await loadPolymarketMarketUniverse({
        limit: 4500,
        pageSize: 500,
        maxPages: 10,
      });
      if (result?.count) {
        console.info(
          `[InstaMarket] Loaded ${result.count} live Polymarket markets.`,
        );
      }

      // Expand to a much larger universe in the background for better long-tail matching.
      if (typeof warmExpandedMarketUniverse === "function") {
        warmExpandedMarketUniverse({ limit: 9000, maxPages: 20 })
          .then((expanded) => {
            if (expanded?.count) {
              console.info(
                `[InstaMarket] Expanded market universe to ${expanded.count} markets.`,
              );
            }
          })
          .catch(() => {
            // Ignore expansion errors; base universe is already loaded.
          });
      }
    } catch (error) {
      console.warn(
        "[InstaMarket] Unable to load live Polymarket markets:",
        error,
      );
    }
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((error) =>
        console.error("[InstaMarket] Init failed:", error),
      );
    });
  } else {
    init().catch((error) => console.error("[InstaMarket] Init failed:", error));
  }
})();
