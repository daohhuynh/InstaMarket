// ============================================================
// INJECT.JS — entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  "use strict";

  let sidebarMounted = false;

  // ── Wait for DOM ready ──────────────────────────────────
  async function init() {
    mountSidebar();
    mountDittoButton();
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
    // Show Ditto only when sidebar is collapsed
    updateDittoVisibility();
  }

  function updateDittoVisibility() {
    const sidebar = document.getElementById("im-sidebar");
    const btn = document.getElementById("im-ditto-btn");
    if (!btn || !sidebar) return;
    const sidebarOpen = !sidebar.classList.contains("im-collapsed");
    btn.classList.toggle("im-hidden", sidebarOpen);
  }

  function watchSidebarForDitto() {
    const sidebar = document.getElementById("im-sidebar");
    if (!sidebar) return;
    new MutationObserver(() => updateDittoVisibility()).observe(sidebar, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function alignDittoToTwitterButtons() {
    function attempt() {
      const grokEl = document.querySelector('[data-testid="GrokDrawer"]');
      const chatEl =
        document.querySelector('[data-testid="DMDrawer"]') ||
        document
          .querySelector(
            '[data-testid="FloatingActionButtons"] a[href*="messages"]',
          )
          ?.closest("[style]");

      if (!grokEl) return false;

      const grokRect = grokEl.getBoundingClientRect();
      const chatRect = chatEl ? chatEl.getBoundingClientRect() : null;

      const btn = document.getElementById("im-ditto-btn");
      const modal = document.getElementById("im-ditto-modal");
      if (!btn) return false;

      const btnSize = grokRect.width; // Usually 56px

      // Calculate the exact gap Twitter uses between its buttons
      let gap = 16;
      if (chatRect && grokRect.bottom < chatRect.top) {
        gap = chatRect.top - grokRect.bottom;
      }

      // Use LEFT and TOP for absolute precision (ignores scrollbar weirdness)
      const dittoLeft = grokRect.left;
      const dittoTop = grokRect.top - btnSize - gap;

      btn.style.position = "fixed";
      btn.style.left = dittoLeft + "px";
      btn.style.top = dittoTop + "px";
      btn.style.width = btnSize + "px";
      btn.style.height = btnSize + "px";

      // Remove the box completely
      btn.style.backgroundColor = "transparent";
      btn.style.border = "none";
      btn.style.boxShadow = "none";
      btn.style.outline = "none";
      btn.style.cursor = "pointer";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.padding = "0";
      btn.style.margin = "0";
      btn.style.zIndex = "9999";

      // Add a native-feeling hover effect to the Pokemon
      btn.style.transition = "transform 0.15s ease-in-out";
      btn.onmouseover = () => (btn.style.transform = "scale(1.15)");
      btn.onmouseout = () => (btn.style.transform = "scale(1)");

      if (modal) {
        // Anchor the modal right next to Ditto
        modal.style.right = window.innerWidth - dittoLeft + 16 + "px";
        modal.style.bottom = window.innerHeight - dittoTop - btnSize + "px";
      }
      return true;
    }

    if (!attempt()) {
      let tries = 0;
      const interval = setInterval(() => {
        if (attempt() || ++tries > 25) clearInterval(interval);
      }, 500);
    }
  }

  // ── Ditto floating button ───────────────────────────────
  function mountDittoButton() {
    if (document.getElementById("im-ditto-btn")) return;

    const DITTO_IMG = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png`;

    const btn = document.createElement("button");
    btn.id = "im-ditto-btn";
    btn.title = "Ditto — Find your trading tribe";

    // Scale the sprite up to fill the invisible button area
    btn.innerHTML = `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <img src="${DITTO_IMG}" alt="Ditto" style="width:50px;height:50px;image-rendering:pixelated;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          </div>`;
    btn.addEventListener("click", toggleDittoModal);
    document.body.appendChild(btn);

    // Snap Ditto's right/bottom to match Twitter's top floating button exactly
    alignDittoToTwitterButtons();

    const modal = document.createElement("div");
    modal.id = "im-ditto-modal";
    modal.innerHTML = renderDittoModal();
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector(".im-ditto-close");
    closeBtn?.addEventListener("click", () => {
      modal.classList.remove("open");
    });

    observeTwitterPanels();
    updateDittoVisibility();
    watchSidebarForDitto();
  }

  function observeTwitterPanels() {
    const observer = new MutationObserver(() => {
      const twitterPanelOpen = !!(
        document.querySelector('[data-testid="DMDrawer"]') ||
        document.querySelector('[data-testid="GrokDrawer"]') ||
        document.querySelector('[aria-label="Direct Messages"]')
      );
      const btn = document.getElementById("im-ditto-btn");
      const modal = document.getElementById("im-ditto-modal");
      if (btn) btn.style.zIndex = twitterPanelOpen ? "1000" : "99999";
      if (modal) modal.style.zIndex = twitterPanelOpen ? "1001" : "100001";
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function toggleDittoModal() {
    const modal = document.getElementById("im-ditto-modal");
    if (!modal) return;
    modal.innerHTML = renderDittoModal();
    const closeBtn = modal.querySelector(".im-ditto-close");
    closeBtn?.addEventListener("click", () => modal.classList.remove("open"));
    modal.classList.toggle("open");
  }

  function renderDittoModal() {
    const betLog = readJsonLocalStorage("instamarket_bet_log_v1");
    const uniqueMarkets = new Set(
      Array.isArray(betLog)
        ? betLog.map((entry) => entry?.marketId).filter(Boolean)
        : [],
    );
    const betCount = Array.isArray(betLog) ? betLog.length : 0;

    return `
      <div class="im-ditto-header">
        <div>
          <div class="im-ditto-title"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:20px;height:20px;vertical-align:middle;image-rendering:pixelated;margin-right:6px;">Ditto Matchmaking</div>
          <div class="im-ditto-sub">Live-only mode</div>
        </div>
        <button class="im-ditto-close">✕</button>
      </div>
      <div class="im-ditto-list">
        <div class="im-ditto-profile">
          <div class="im-market-title">No mock profiles</div>
          <div class="im-ditto-reason">This panel is now live-only. Matchmaker profiles will appear when Person 4's compatibility service is connected.</div>
        </div>
        <div class="im-ditto-profile">
          <div class="im-market-title">Your activity snapshot</div>
          <div class="im-ditto-reason">Bets placed: ${betCount}</div>
          <div class="im-ditto-reason">Markets traded: ${uniqueMarkets.size}</div>
        </div>
      </div>
    `;
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
