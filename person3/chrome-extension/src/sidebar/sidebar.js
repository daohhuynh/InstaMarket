// ============================================================
// SIDEBAR — renders the InstaMarket right sidebar (live-data only)
// ============================================================

const IM_MARKET_RESEARCH = {};
/** Latest persona-sim API payload per market id (survives tab rerenders). */
const IM_PERSONA_SIM_BY_MARKET = {};
const IM_SAVED_MARKETS_KEY = "instamarket_saved_markets_v1";
const IM_BET_LOG_KEY = "instamarket_bet_log_v1";
const IM_MAX_SAVED_MARKETS = 200;
const IM_MAX_BET_LOG = 250;

let IM_ACTIVE_MARKET_ID = null;

function setMarketResearch(marketId, research) {
  if (!marketId || !research) return;
  IM_MARKET_RESEARCH[String(marketId)] = research;
}

function getMarketResearch(marketId) {
  return IM_MARKET_RESEARCH[String(marketId)] || null;
}

function getPersonaSimForMarket(marketId) {
  if (marketId == null) return null;
  return IM_PERSONA_SIM_BY_MARKET[String(marketId)] || null;
}

function setPersonaSimForMarket(marketId, data) {
  if (marketId == null || !data) return;
  IM_PERSONA_SIM_BY_MARKET[String(marketId)] = data;
}

function createSidebar() {
  const existing = document.getElementById("im-sidebar");
  if (existing) return;

  const sidebar = document.createElement("div");
  sidebar.id = "im-sidebar";
  sidebar.innerHTML = `
    <div class="im-tab-bar">
      <button class="im-tab active" data-tab="portfolio"><span>Portfolio</span></button>
      <button class="im-tab" data-tab="markets"><span>Markets</span></button>
      <button class="im-tab" data-tab="saved"><span>Saved</span></button>
    </div>

    <div class="im-tab-content active" id="im-tab-portfolio">
      ${renderPortfolioTab()}
    </div>

    <div class="im-tab-content" id="im-tab-markets">
      ${renderMarketsTab(IM_ACTIVE_MARKET_ID)}
    </div>

    <div class="im-tab-content" id="im-tab-saved">
      ${renderSavedTab()}
    </div>
  `;

  document.body.appendChild(sidebar);
  bindSidebarEvents();
}

function renderPortfolioTab() {
  const betLog = getBetLog();
  if (!betLog.length) {
    return renderEmptyPanel(
      "No portfolio data yet",
      "Place your first YES/NO bet from a tweet card and your activity will appear here.",
    );
  }

  const yesCount = betLog.filter((entry) => entry.side === "YES").length;
  const noCount = betLog.filter((entry) => entry.side === "NO").length;
  const uniqueMarkets = new Set(betLog.map((entry) => entry.marketId)).size;
  const recent = [...betLog].slice(-12).reverse();

  return `
    <div class="im-portfolio-header">
      <div style="font-size:11px;color:var(--pm-text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Live Portfolio Activity</div>
      <div class="im-portfolio-value">${betLog.length} Bets</div>
      <div class="im-portfolio-stats">
        <div class="im-stat-box">
          <div class="im-stat-label">YES Bets</div>
          <div class="im-stat-val green">${yesCount}</div>
        </div>
        <div class="im-stat-box">
          <div class="im-stat-label">NO Bets</div>
          <div class="im-stat-val red">${noCount}</div>
        </div>
        <div class="im-stat-box">
          <div class="im-stat-label">Markets</div>
          <div class="im-stat-val">${uniqueMarkets}</div>
        </div>
      </div>
    </div>

    <div class="im-section-header">Recent Bets</div>
    ${recent.map(renderBetRow).join("")}
  `;
}

function renderBetRow(entry) {
  const positiveSide = entry.side === "YES";
  const amountLabel =
    Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
      ? `$${Number(entry.amount).toLocaleString("en-US")}`
      : "";
  return `
    <div class="im-position-row">
      <div class="im-position-info">
        <div class="im-position-title">${escapeHtml(entry.question || "Unknown market")}</div>
        <div class="im-position-meta">
          <span style="color:${positiveSide ? "var(--pm-green)" : "var(--pm-red)"};">${escapeHtml(entry.side)}</span>
          ${amountLabel ? `&nbsp;·&nbsp;${escapeHtml(amountLabel)}` : ""}&nbsp;·&nbsp;${formatTimestamp(entry.placedAt)}
        </div>
      </div>
      <div class="im-position-pnl ${positiveSide ? "pos" : "neg"}">${positiveSide ? "YES" : "NO"}</div>
    </div>
  `;
}

function renderMarketsTab(activeMarketId) {
  const markets = getRenderableMarkets();
  if (!markets.length) {
    return `
      ${renderEmptyPanel(
        "No live markets loaded",
        "Could not load active Polymarket markets yet. Click refresh to retry.",
      )}
      <button class="im-export-btn" data-im-action="refresh-live-markets">Refresh Live Markets</button>
    `;
  }

  const primary = resolvePrimaryMarket(markets, activeMarketId);
  if (!primary) {
    return renderEmptyPanel(
      "No matchable markets",
      "Live data loaded but no valid market entries were found.",
    );
  }

  const related = buildRelatedMarkets(primary, markets);
  const research = getMarketResearch(primary.id);

  return `
    ${renderMarketCard(primary, true)}

    <div class="im-section-header">Related Markets</div>
    ${related.length ? related.map((market) => renderMarketCard(market, false)).join("") : renderEmptyPanel("No related markets", "No nearby related market found for this topic.")}

    <div class="im-section-header">Research</div>
    ${research ? renderResearchCard(research) : renderResearchPlaceholder(primary)}

    ${renderPersonaSimSection(primary.id)}

    <button class="im-export-btn" data-im-action="refresh-live-markets">Refresh Live Markets</button>
  `;
}

function renderPersonaSimSection(marketId) {
  const data = getPersonaSimForMarket(marketId);
  if (!data) return "";
  return `<div id="im-persona-sim">${renderPersonaSimTab(data)}</div>`;
}

function getRenderableMarkets() {
  if (typeof getMarketUniverse !== "function") {
    return [];
  }

  const liveMarkets = getMarketUniverse();
  if (!Array.isArray(liveMarkets)) {
    return [];
  }

  return liveMarkets;
}

function resolvePrimaryMarket(markets, activeMarketId) {
  if (!Array.isArray(markets) || !markets.length) {
    return null;
  }

  if (activeMarketId && typeof getMarketById === "function") {
    const direct = getMarketById(activeMarketId);
    if (direct) return direct;
  }

  return markets[0] || null;
}

function buildRelatedMarkets(primary, markets) {
  if (!primary || !Array.isArray(markets)) return [];

  if (
    Array.isArray(primary.relatedMarkets) &&
    primary.relatedMarkets.length > 0
  ) {
    const byId = new Map(markets.map((market) => [String(market.id), market]));
    return primary.relatedMarkets
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .slice(0, 4);
  }

  const sameCategory = markets.filter(
    (market) =>
      market.id !== primary.id &&
      market.category &&
      primary.category &&
      market.category === primary.category,
  );
  if (sameCategory.length > 0) {
    return sameCategory.slice(0, 4);
  }

  const lexical = markets
    .filter((market) => market.id !== primary.id)
    .map((market) => ({
      market,
      score: lexicalOverlap(primary.question, market.question),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.market);

  return lexical;
}

function lexicalOverlap(leftText, rightText) {
  if (typeof tokenizeForMatch !== "function") return 0;
  const left = new Set(tokenizeForMatch(leftText));
  const right = new Set(tokenizeForMatch(rightText));

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function renderResearchCard(research) {
  const terms = Array.isArray(research.matchedTerms)
    ? research.matchedTerms
    : [];
  const steps = Array.isArray(research.steps) ? research.steps : [];
  const confidence = Number.isFinite(research.confidence)
    ? research.confidence
    : 0;
  const method =
    typeof research.method === "string" ? research.method : "Parser";

  return `
    <div class="im-risk-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div class="im-market-title">${escapeHtml(research.title || "Market research")}</div>
        <div style="font-size:11px;color:var(--pm-blue);font-weight:700;">${confidence}% confidence</div>
      </div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        ${escapeHtml(research.summary || "No summary available.")}
      </div>
      <div style="font-size:11px;color:var(--pm-blue);font-weight:600;">
        Method: ${escapeHtml(method)}
      </div>
      ${
        terms.length
          ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${terms.map((term) => `<span class="im-best-match-badge" style="border-color:var(--pm-blue);color:var(--pm-blue);background:rgba(59,130,246,0.12);">${escapeHtml(term)}</span>`).join("")}
        </div>
      `
          : ""
      }
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${steps
          .map(
            (step, index) => `
          <div class="im-reasoning-step" style="border-bottom:none;padding:0;">
            <span class="step-num">${index + 1}.</span>
            <span>${escapeHtml(step)}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderResearchPlaceholder(primaryMarket) {
  return `
    <div class="im-risk-panel">
      <div class="im-market-title">No research yet</div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        Click <strong>Research</strong> on a tweet that matches "${escapeHtml(primaryMarket.question)}" to store live parser evidence.
      </div>
    </div>
  `;
}

function renderMarketCard(market, isBest) {
  const marketLink = market.polymarketUrl
    ? `<a href="${escapeHtml(market.polymarketUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--pm-blue);text-decoration:none;">Open ↗</a>`
    : "";

  return `
    <div class="im-market-card ${isBest ? "best-match" : ""}">
      ${isBest ? '<div class="im-best-match-badge">Best Match</div>' : ""}
      <div class="im-market-title">${escapeHtml(market.question)}</div>
      <div class="im-market-meta">
        <span>${escapeHtml(market.volume || "$0 Vol")}</span>
        ${market.category ? `<span>· ${escapeHtml(market.category)}</span>` : ""}
        ${marketLink}
      </div>
      <div class="im-market-odds-row">
        <div class="im-yes-bar-wrap" data-im-action="bet" data-market-id="${escapeHtml(String(market.id))}" data-side="YES">
          <div class="im-bar-fill im-yes-fill" style="width:${Number(market.yesOdds) || 0}%"></div>
          <div class="im-bar-label">
            <span class="im-arrow-up"></span>
            YES ${Number(market.yesOdds) || 0}%
          </div>
        </div>
        <div class="im-no-bar-wrap" data-im-action="bet" data-market-id="${escapeHtml(String(market.id))}" data-side="NO">
          <div class="im-bar-fill im-no-fill" style="width:${Number(market.noOdds) || 0}%"></div>
          <div class="im-bar-label">
            <span class="im-arrow-down"></span>
            NO ${Number(market.noOdds) || 0}%
          </div>
        </div>
        <button class="im-card-save-btn" data-im-action="save-market" data-market-id="${escapeHtml(String(market.id))}">
          Save
        </button>
      </div>
    </div>
  `;
}

function renderSavedTab() {
  const saved = getSavedMarketsDetailed();
  if (!saved.length) {
    return renderEmptyPanel(
      "No saved markets yet",
      "Use the Save button on tweet cards or market cards to track markets over time.",
    );
  }

  return saved
    .map((item) => {
      const currentYes = Number.isFinite(item.currentYesOdds)
        ? item.currentYesOdds
        : item.savedYesOdds;
      const currentNo = Number.isFinite(item.currentNoOdds)
        ? item.currentNoOdds
        : item.savedNoOdds;

      let deltaHtml =
        '<span style="font-size:12px;color:var(--pm-text-secondary);">Current odds unavailable.</span>';
      if (Number.isFinite(item.currentYesOdds)) {
        const delta = item.currentYesOdds - item.savedYesOdds;
        const favorable = delta >= 0;
        deltaHtml = `
        <div class="im-saved-delta ${favorable ? "up" : "down"}">
          <span class="${favorable ? "im-arrow-up" : "im-arrow-down"}"></span>
          ${favorable ? "+" : ""}${delta}% since saved
        </div>
      `;
      }

      return `
      <div class="im-saved-row">
        <div class="im-market-title">${escapeHtml(item.question)}</div>
        <div class="im-market-meta">
          <span>Saved ${formatTimestamp(item.savedAt)}</span>
          <span style="margin-left:4px;">· Saved at ${item.savedYesOdds}% YES</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          ${deltaHtml}
          <span style="font-size:11px;color:var(--pm-text-secondary);">${escapeHtml(item.currentVolume || item.savedVolume || "$0 Vol")}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:2px;">
          <button class="im-bet-yes" style="flex:1;justify-content:center;" data-im-action="bet" data-market-id="${escapeHtml(String(item.marketId))}" data-side="YES">
            <span class="im-arrow-up"></span> YES ${currentYes}%
          </button>
          <button class="im-bet-no" style="flex:1;justify-content:center;" data-im-action="bet" data-market-id="${escapeHtml(String(item.marketId))}" data-side="NO">
            <span class="im-arrow-down"></span> NO ${currentNo}%
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

function bindSidebarEvents() {
  const sidebar = document.getElementById("im-sidebar");
  if (!sidebar || sidebar.dataset.imBound === "1") {
    return;
  }
  sidebar.dataset.imBound = "1";

  sidebar.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-im-action]");
    if (!target) return;

    const action = target.getAttribute("data-im-action");
    const marketId = target.getAttribute("data-market-id");
    const side = target.getAttribute("data-side");

    if (action === "save-market" && marketId) {
      const saved = saveMarketForLater(marketId);
      showToast(saved ? "Market saved." : "Market already saved.");
      rerenderSavedTabIfVisible();
      return;
    }

    if (action === "bet" && marketId && side) {
      const recorded = recordSidebarBet(marketId, side);
      if (recorded) {
        showToast(`Bet placed: ${side}`);
        rerenderPortfolioTabIfVisible();
      }
      return;
    }

    if (action === "refresh-live-markets") {
      if (typeof loadPolymarketMarketUniverse !== "function") {
        showToast("Live market loader unavailable.");
        return;
      }
      try {
        await loadPolymarketMarketUniverse({
          limit: 2200,
          pageSize: 500,
          maxPages: 6,
        });
        showToast("Live markets refreshed.");
        rerenderMarketsTab();
      } catch {
        showToast("Refresh failed.");
      }
    }
  });

  document.querySelectorAll(".im-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      if (!tabName) return;

      document
        .querySelectorAll(".im-tab")
        .forEach((item) => item.classList.remove("active"));
      document
        .querySelectorAll(".im-tab-content")
        .forEach((item) => item.classList.remove("active"));

      tab.classList.add("active");
      const content = document.getElementById(`im-tab-${tabName}`);
      if (!content) return;

      if (tabName === "portfolio") {
        content.innerHTML = renderPortfolioTab();
      } else if (tabName === "markets") {
        content.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
      } else if (tabName === "saved") {
        content.innerHTML = renderSavedTab();
      }

      content.classList.add("active");
    });
  });
}

function rerenderMarketsTab() {
  const content = document.getElementById("im-tab-markets");
  if (!content) return;
  content.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
}

function rerenderSavedTabIfVisible() {
  const content = document.getElementById("im-tab-saved");
  if (!content || !content.classList.contains("active")) return;
  content.innerHTML = renderSavedTab();
}

function rerenderPortfolioTabIfVisible() {
  const content = document.getElementById("im-tab-portfolio");
  if (!content || !content.classList.contains("active")) return;
  content.innerHTML = renderPortfolioTab();
}

function saveMarketForLater(marketId) {
  if (!marketId) return false;
  const market =
    typeof getMarketById === "function" ? getMarketById(marketId) : null;
  if (!market) return false;

  const saved = loadJsonLocalStorage(IM_SAVED_MARKETS_KEY, []);
  const exists = saved.some(
    (entry) => String(entry.marketId) === String(market.id),
  );
  if (exists) return false;

  saved.push({
    marketId: String(market.id),
    question: market.question,
    savedAt: new Date().toISOString(),
    savedYesOdds: Number(market.yesOdds) || 0,
    savedNoOdds: Number(market.noOdds) || 0,
    savedVolume: market.volume || "$0 Vol",
  });

  while (saved.length > IM_MAX_SAVED_MARKETS) {
    saved.shift();
  }

  storeJsonLocalStorage(IM_SAVED_MARKETS_KEY, saved);
  return true;
}

function getSavedMarketsDetailed() {
  const saved = loadJsonLocalStorage(IM_SAVED_MARKETS_KEY, []);

  return saved
    .map((entry) => {
      const live =
        typeof getMarketById === "function"
          ? getMarketById(entry.marketId)
          : null;
      return {
        marketId: String(entry.marketId),
        question: live?.question || entry.question || "Unknown market",
        savedAt: entry.savedAt,
        savedYesOdds: Number(entry.savedYesOdds) || 0,
        savedNoOdds: Number(entry.savedNoOdds) || 0,
        savedVolume: entry.savedVolume || "$0 Vol",
        currentYesOdds: live ? Number(live.yesOdds) : NaN,
        currentNoOdds: live ? Number(live.noOdds) : NaN,
        currentVolume: live?.volume || "",
      };
    })
    .reverse();
}

function recordSidebarBet(marketId, side, amount) {
  if (!marketId || (side !== "YES" && side !== "NO")) return false;

  const market =
    typeof getMarketById === "function" ? getMarketById(marketId) : null;
  if (!market) return false;
  const normalizedAmount = Math.max(1, Math.round(Number(amount) || 0));

  const betLog = loadJsonLocalStorage(IM_BET_LOG_KEY, []);
  betLog.push({
    marketId: String(market.id),
    question: market.question,
    side,
    amount: normalizedAmount,
    yesOdds: Number(market.yesOdds) || 0,
    noOdds: Number(market.noOdds) || 0,
    placedAt: new Date().toISOString(),
  });

  while (betLog.length > IM_MAX_BET_LOG) {
    betLog.shift();
  }

  storeJsonLocalStorage(IM_BET_LOG_KEY, betLog);
  return true;
}

function getBetLog() {
  return loadJsonLocalStorage(IM_BET_LOG_KEY, []);
}

function loadJsonLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function storeJsonLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Intentionally ignore local storage write failures.
  }
}

function renderEmptyPanel(title, description) {
  return `
    <div class="im-risk-panel">
      <div class="im-market-title">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">${escapeHtml(description)}</div>
    </div>
  `;
}

function formatTimestamp(value) {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "just now";

  const diffMs = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.max(1, Math.round(diffMs / hour))}h ago`;

  return `${Math.max(1, Math.round(diffMs / day))}d ago`;
}

// ── Persona Simulation ───────────────────────────────────────

function renderAgentCard(agent, isYes) {
  return `
    <div class="im-position-row" style="flex-direction:column;align-items:flex-start;gap:4px;padding:10px 0;border-bottom:1px solid var(--pm-border);">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div class="im-market-title" style="font-size:12px;">@${escapeHtml(agent.name)}</div>
        <div style="font-size:11px;font-weight:700;color:${isYes ? "var(--pm-green)" : "var(--pm-red)"};">
          ${escapeHtml(agent.decision)} · ${agent.confidence}% conf
        </div>
      </div>
      <div style="font-size:11px;color:var(--pm-text-secondary);">${escapeHtml(agent.type)} · ${agent.shares} shares</div>
      <div style="font-size:12px;color:var(--pm-text);font-style:italic;">"${escapeHtml(agent.reasoning)}"</div>
    </div>
  `;
}

function renderPersonaSimTab(data) {
  if (!data) {
    return renderEmptyPanel(
      "Simulation unavailable",
      "Could not load persona simulation data.",
    );
  }

  const edge = data.simulatedYesPct - data.realYesPct;
  const edgePositive = edge >= 0;
  const edgeColor = edgePositive ? "var(--pm-green)" : "var(--pm-red)";
  const edgeLabel = `${edgePositive ? "+" : ""}${edge}% ${edgePositive ? "YES" : "NO"} vs market`;

  const topYes = data.topYes || [];
  const topNo = data.topNo || [];

  return `
    <div class="im-section-header">Agent Simulation · ${data.totalAgents} traders</div>
    <div class="im-risk-panel">

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
        <div>
          <div class="im-market-title" style="font-size:13px;">Agents: ${data.simulatedYesPct}% YES / ${data.simulatedNoPct}% NO</div>
          <div style="font-size:11px;color:var(--pm-text-secondary);">Market: ${data.realYesPct}% YES / ${data.realNoPct}% NO</div>
        </div>
        <div style="font-size:13px;font-weight:800;color:${edgeColor};">${edgeLabel}</div>
      </div>

      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:16px;">
        <div style="width:${data.simulatedYesPct}%;background:var(--pm-green);transition:width 0.4s ease;"></div>
        <div style="width:${data.simulatedNoPct}%;background:var(--pm-red);transition:width 0.4s ease;"></div>
      </div>

      ${
        topYes.length
          ? `
        <div style="font-size:11px;font-weight:700;color:var(--pm-green);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Bullish Agents</div>
        ${topYes.map((a) => renderAgentCard(a, true)).join("")}
      `
          : ""
      }

      ${
        topNo.length
          ? `
        <div style="font-size:11px;font-weight:700;color:var(--pm-red);text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 4px;">Bearish Agents</div>
        ${topNo.map((a) => renderAgentCard(a, false)).join("")}
      `
          : ""
      }

    </div>
  `;
}

window.renderPersonaSimInSidebar = function (data, marketId) {
  const id =
    marketId != null
      ? String(marketId)
      : IM_ACTIVE_MARKET_ID != null
        ? String(IM_ACTIVE_MARKET_ID)
        : null;
  if (!id || !data) return;
  setPersonaSimForMarket(id, data);
  const marketsContent = document.getElementById("im-tab-markets");
  if (marketsContent && marketsContent.classList.contains("active")) {
    rerenderMarketsTab();
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message) {
  let toast = document.getElementById("im-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "im-toast";
    toast.className = "im-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function switchSidebarToMarkets(marketId) {
  const sidebar = document.getElementById("im-sidebar");
  if (!sidebar) {
    createSidebar();
  }

  IM_ACTIVE_MARKET_ID = marketId || IM_ACTIVE_MARKET_ID;

  document
    .querySelectorAll(".im-tab")
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll(".im-tab-content")
    .forEach((item) => item.classList.remove("active"));

  const marketsTab = document.querySelector('.im-tab[data-tab="markets"]');
  const marketsContent = document.getElementById("im-tab-markets");

  if (marketsTab) {
    marketsTab.classList.add("active");
  }

  if (marketsContent) {
    marketsContent.classList.add("active");
    marketsContent.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
  }
}

window.setMarketResearch = setMarketResearch;
window.switchSidebarToMarkets = switchSidebarToMarkets;
window.saveMarketForLater = saveMarketForLater;
window.recordSidebarBet = recordSidebarBet;
