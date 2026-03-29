// ============================================================
// INJECT.JS — entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  "use strict";

  let sidebarMounted = false;
  const IM_TRADE_AMOUNT_MIN = 1;
  const IM_TRADE_AMOUNT_MAX = 1000;
  const IM_TRADE_AMOUNT_DEFAULT = 250;
  /** Prevents duplicate /api/persona-sim runs (10 Bedrock calls each). */
  let imPersonaSimInFlight = false;

  // ── Wait for DOM ready ──────────────────────────────────
  async function init() {
    mountSidebar();
    await hydrateMarketUniverse();
    observeTweets();
    window.addEventListener('resize', syncAllTweetLayerAlignments);
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
      <div class="im-market-shell">
        <div class="im-market-header">
          <span class="im-market-question">${safeQuestion}</span>
          <span class="im-match-confidence">
            <span class="im-match-dot"></span>
            ${match.confidence}% ${match.source === "aws-bedrock" ? "AI" : "parser"} match
          </span>
        </div>
        <div class="im-probability-panel">
          <div class="im-probability-meta-row">
            <button class="im-save-btn" data-market="${safeMarketId}" title="Save market">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
            </button>
            <div class="im-side-choice im-side-choice-yes">
              <span class="im-side-choice-label">YES</span>
              <span class="im-side-choice-pct">${market.yesOdds}%</span>
            </div>
            <div class="im-volume-inline">${safeVolume}</div>
            <div class="im-side-choice im-side-choice-no">
              <span class="im-side-choice-label">NO</span>
              <span class="im-side-choice-pct">${market.noOdds}%</span>
            </div>
            <div class="im-pm-link" title="View on Polymarket" data-market-url="${safeMarketUrl}">
              <svg class="im-pm-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="2" fill="none"/>
              </svg>
            </div>
          </div>
          <div class="im-probability-bar" aria-label="Market odds">
            <div class="im-probability-fill im-probability-fill-yes" style="width:${market.yesOdds}%"></div>
            <div class="im-probability-fill im-probability-fill-no" style="width:${market.noOdds}%"></div>
          </div>
          <div class="im-trade-choice-row">
            <button class="im-trade-choice im-trade-choice-yes" data-market="${safeMarketId}" data-side="YES">
              Bet YES
            </button>
            <div class="im-inline-controls">
              <label class="im-amount-pill" aria-label="Trade amount in dollars">
                <span class="im-currency-symbol">$</span>
                <input
                  class="im-amount-input"
                  type="number"
                  min="${IM_TRADE_AMOUNT_MIN}"
                  max="${IM_TRADE_AMOUNT_MAX}"
                  step="1"
                  value="${IM_TRADE_AMOUNT_DEFAULT}"
                  inputmode="numeric"
                />
              </label>
              <button class="im-research-btn" data-market="${safeMarketId}">Research</button>
            </div>
            <button class="im-trade-choice im-trade-choice-no" data-market="${safeMarketId}" data-side="NO">
              Bet NO
            </button>
          </div>
        </div>
      </div>
    `;

    bindTradeAmountControls(layer);

    // Bet buttons → instant bet + show markets sidebar
    layer.querySelectorAll("[data-side][data-market]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const side = btn.dataset.side;
        const mId = btn.dataset.market;
        const amount = getSelectedTradeAmount(layer);
        showToast(
          `Bet placed: $${formatTradeAmount(amount)} ${side} on "${market.question.slice(0, 40)}…" ✓`,
        );
        if (typeof window.recordSidebarBet === "function") {
          window.recordSidebarBet(mId, side, amount);
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
      if (imPersonaSimInFlight) {
        showToast("Persona simulation already running — please wait.");
        return;
      }
      persistResearch(market.id, researchSummary);
      showToast(`Research ready: "${market.question.slice(0, 40)}…"`);
      switchSidebarToMarkets(market.id);

      imPersonaSimInFlight = true;
      const marketIdForSim = market.id;
      fetch("http://localhost:3000/api/persona-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetText, market }),
        signal: AbortSignal.timeout(120000),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (r.status === 409) {
            showToast(
              data.error ||
                "A simulation is already running on the server. Try again shortly.",
            );
            return;
          }
          if (!r.ok) {
            showToast(data.error || "Persona simulation failed.");
            return;
          }
          if (typeof window.renderPersonaSimInSidebar === "function") {
            window.renderPersonaSimInSidebar(data, marketIdForSim);
          }
        })
        .catch(() => {
          showToast("Persona simulation failed or timed out.");
        })
        .finally(() => {
          imPersonaSimInFlight = false;
        });
    });

    const pmLink = layer.querySelector(".im-pm-link");
    pmLink?.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetUrl = pmLink.getAttribute("data-market-url");
      if (targetUrl) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
    });

    // Insert immediately before the tweet action row
    const actionRow = tweet.querySelector('[role="group"]');
    if (actionRow && actionRow.parentNode) {
      actionRow.parentNode.insertBefore(layer, actionRow);
    } else {
      tweet.appendChild(layer);
    }

    syncTweetLayerAlignment(layer, tweet);
    requestAnimationFrame(() => syncTweetLayerAlignment(layer, tweet));
    window.setTimeout(() => syncTweetLayerAlignment(layer, tweet), 180);
  }

  function syncTweetLayerAlignment(layer, tweet) {
    if (!layer || !tweet?.isConnected) return;

    const contentAnchor = findTweetContentAnchor(tweet);
    if (!contentAnchor) return;

    const layerRect = layer.getBoundingClientRect();
    const contentRect = contentAnchor.getBoundingClientRect();
    const offset = Math.round(contentRect.left - layerRect.left);

    if (Number.isFinite(offset) && offset >= 0) {
      layer.style.setProperty('--im-content-offset', `${Math.min(offset, 160)}px`);
    }
  }

  function bindTradeAmountControls(layer) {
    const amountInput = layer.querySelector('.im-amount-input');
    const amountPill = layer.querySelector('.im-amount-pill');
    if (!amountInput) return;

    const syncAmount = value => {
      const amount = normalizeTradeAmount(value);
      amountInput.value = String(amount);
      return amount;
    };

    syncAmount(amountInput.value || IM_TRADE_AMOUNT_DEFAULT);

    const stopTweetNavigation = event => event.stopPropagation();
    [amountInput, amountPill].filter(Boolean).forEach(control => {
      control.addEventListener('click', stopTweetNavigation);
      control.addEventListener('pointerdown', stopTweetNavigation);
    });

    amountInput.addEventListener('input', () => {
      if (!amountInput.value.trim()) return;
      syncAmount(amountInput.value);
    });

    amountInput.addEventListener('blur', () => {
      syncAmount(amountInput.value || IM_TRADE_AMOUNT_DEFAULT);
    });
  }

  function getSelectedTradeAmount(layer) {
    const amountInput = layer.querySelector('.im-amount-input');
    return normalizeTradeAmount(amountInput?.value || IM_TRADE_AMOUNT_DEFAULT);
  }

  function normalizeTradeAmount(value) {
    const parsed = Math.round(Number.parseFloat(value));
    if (!Number.isFinite(parsed)) return IM_TRADE_AMOUNT_DEFAULT;
    return Math.min(IM_TRADE_AMOUNT_MAX, Math.max(IM_TRADE_AMOUNT_MIN, parsed));
  }

  function formatTradeAmount(value) {
    return normalizeTradeAmount(value).toLocaleString('en-US');
  }

  function syncAllTweetLayerAlignments() {
    document.querySelectorAll('article[data-testid="tweet"][data-im-injected]').forEach(tweet => {
      const layer = tweet.querySelector('.im-tweet-layer');
      if (layer) {
        syncTweetLayerAlignment(layer, tweet);
      }
    });
  }

  function findTweetContentAnchor(tweet) {
    return (
      tweet.querySelector('[data-testid="tweetText"]') ||
      tweet.querySelector('div[lang]') ||
      tweet.querySelector('[data-testid="tweetPhoto"]')?.closest('div[dir="ltr"], div[dir="auto"], div') ||
      tweet.querySelector('[role="link"] div[dir="auto"]')
    );
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
