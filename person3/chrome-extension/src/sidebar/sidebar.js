// ============================================================
// SIDEBAR — renders the InstaMarket right sidebar (live-data only)
// ============================================================

const IM_MARKET_RESEARCH = {};
const IM_SAVED_MARKETS_KEY = 'instamarket_saved_markets_v1';
const IM_BET_LOG_KEY = 'instamarket_bet_log_v1';
const IM_MAX_SAVED_MARKETS = 200;
const IM_MAX_BET_LOG = 250;
const IM_PERSISTENT_KEYS = [IM_SAVED_MARKETS_KEY, IM_BET_LOG_KEY];

let IM_ACTIVE_MARKET_ID = null;
const IM_RELATED_MARKETS_LIMIT = 24;
let IM_STORAGE_SYNC_INITIALIZED = false;
let IM_STORAGE_CHANGE_LISTENER_BOUND = false;
const IM_STORAGE_MEMORY = Object.create(null);

function createFloatingPnL(element, pnl, won) {
  const floating = document.createElement('div');
  floating.className = `im2-rise-pnl-premium ${won ? 'win' : 'lose'}`;
  const sign = Number(pnl) >= 0 ? '+' : '';
  floating.textContent = `${sign}$${Math.abs(Number(pnl)).toFixed(2)}`;
  document.body.appendChild(floating);
  setTimeout(() => floating.remove(), 1200);
}
const SCRAPER_NOISE_PATTERNS = [
  /scraper process failed;\s*using deterministic source seeds\.?/i,
  /fallback mode:\s*scraper pipeline failed\.?/i,
];

function isNoisyScraperLine(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return SCRAPER_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function setMarketResearch(marketId, research) {
  if (!marketId || !research) return;
  IM_MARKET_RESEARCH[String(marketId)] = research;
}

function getMarketResearch(marketId) {
  return IM_MARKET_RESEARCH[String(marketId)] || null;
}

function createSidebar() {
  const existing = document.getElementById('im-sidebar');
  if (existing) return;
  initPersistentStateSync();

  const sidebar = document.createElement('div');
  sidebar.id = 'im-sidebar';
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
      'No portfolio data yet',
      'Place your first YES/NO bet from a matched story card and your activity will appear here.'
    );
  }

  const yesSpend = betLog
    .filter(entry => entry.side === 'YES')
    .reduce((sum, entry) => sum + toUsdAmount(entry.amount), 0);
  const noSpend = betLog
    .filter(entry => entry.side === 'NO')
    .reduce((sum, entry) => sum + toUsdAmount(entry.amount), 0);
  const yesCount = betLog.filter(entry => entry.side === 'YES').length;
  const noCount = betLog.filter(entry => entry.side === 'NO').length;
  const recent = [...betLog].slice(-12).reverse();

  return `
    <div class="im-portfolio-header">
      <div class="im-portfolio-kicker">Portfolio Activity</div>
      <div class="im-portfolio-stats">
        <div class="im-stat-box">
          <div class="im-stat-label">On YES</div>
          <div class="im-stat-val green">${formatUsd(yesSpend)}</div>
          <div class="im-stat-sub">${yesCount} bet${yesCount === 1 ? '' : 's'}</div>
        </div>
        <div class="im-stat-box">
          <div class="im-stat-label">On NO</div>
          <div class="im-stat-val red">${formatUsd(noSpend)}</div>
          <div class="im-stat-sub">${noCount} bet${noCount === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>

    <div class="im-section-header">Recent Bets</div>
    ${recent.map(renderBetRow).join('')}

    <div class="im-section-header">Research</div>
    ${renderPortfolioResearchSection()}
  `;
}

function toUsdAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function formatUsd(value) {
  const amount = Math.max(0, Number(value) || 0);
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function renderBetRow(entry) {
  const positiveSide = entry.side === 'YES';
  const postUrl = sanitizePostUrl(entry?.postUrl || '');
  const normalizedAmount =
    Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
      ? Math.round(Number(entry.amount))
      : 0;
  const clickableAttrs = postUrl
    ? ` data-im-action="open-bet-post" data-post-url="${escapeHtml(postUrl)}" title="Open source page" role="button" tabindex="0"`
    : '';
  const amountLabel =
    normalizedAmount > 0
      ? `$${normalizedAmount.toLocaleString('en-US')}`
      : '';
  return `
    <div class="im-position-row ${postUrl ? 'im-position-row-link' : ''}"${clickableAttrs}>
      <div class="im-position-info">
        <div class="im-position-title">${escapeHtml(entry.question || 'Unknown market')}</div>
        <div class="im-position-meta">
          <span style="color:${positiveSide ? 'var(--pm-green)' : 'var(--pm-red)'};">${escapeHtml(entry.side)}</span>
          ${amountLabel ? `&nbsp;·&nbsp;${escapeHtml(amountLabel)}` : ''}
          &nbsp;·&nbsp;${formatTimestamp(entry.placedAt)}
        </div>
      </div>
      <div
        class="im-position-pnl ${positiveSide ? 'pos' : 'neg'}"
        data-im-action="show-bet-amount"
        data-side="${escapeHtml(positiveSide ? 'YES' : 'NO')}"
        data-amount="${escapeHtml(String(normalizedAmount))}"
        title="Show bet amount"
      >${positiveSide ? 'YES' : 'NO'}</div>
    </div>
  `;
}

function renderMarketsTab(activeMarketId) {
  const markets = getRenderableMarkets();
  if (!markets.length) {
    return `
      ${renderEmptyPanel(
      'No live markets loaded',
      'Could not load active Polymarket markets yet. Click refresh to retry.'
    )}
      <button class="im-export-btn" data-im-action="refresh-live-markets">Refresh Live Markets</button>
    `;
  }

  const primary = resolvePrimaryMarket(markets, activeMarketId);
  if (!primary) {
    return renderEmptyPanel('No matchable markets', 'Live data loaded but no valid market entries were found.');
  }

  const related = buildRelatedMarkets(primary, markets);
  const relatedHeader = `Related Markets${related.length ? ` (${related.length})` : ''}`;

  return `
    ${renderMarketCard(primary, true)}

    <div class="im-section-header">${relatedHeader}</div>
    ${related.length ? related.map(market => renderMarketCard(market, false)).join('') : renderEmptyPanel('No related markets', 'No nearby related market found for this topic.')}

    <button class="im-export-btn" data-im-action="refresh-live-markets">Refresh Live Markets</button>
  `;
}

function getRenderableMarkets() {
  if (typeof getMarketUniverse !== 'function') {
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

  if (activeMarketId && typeof getMarketById === 'function') {
    const direct = getMarketById(activeMarketId);
    if (direct) return direct;
  }

  return markets[0] || null;
}

function buildRelatedMarkets(primary, markets) {
  if (!primary || !Array.isArray(markets)) return [];
  const primaryId = String(primary.id);
  const byId = new Map(markets.map(market => [String(market.id), market]));
  const scored = new Map();

  function pushCandidate(market, baseScore, overlapBonus = 0) {
    if (!market) return;
    const marketId = String(market.id);
    if (!marketId || marketId === primaryId) return;

    const score = Number(baseScore || 0) + Number(overlapBonus || 0);
    const previous = scored.get(marketId);
    if (!previous || score > previous.score) {
      scored.set(marketId, { market, score });
    }
  }

  if (Array.isArray(primary.relatedMarkets) && primary.relatedMarkets.length > 0) {
    primary.relatedMarkets.forEach((id, index) => {
      const market = byId.get(String(id));
      pushCandidate(market, 200 - index);
    });
  }

  const primaryCategory = String(primary.category || '').trim().toLowerCase();
  const sameCategory = primaryCategory
    ? markets.filter(market => String(market.id) !== primaryId && String(market.category || '').trim().toLowerCase() === primaryCategory)
    : [];

  for (const market of sameCategory) {
    const overlap = lexicalOverlap(primary.question, market.question);
    if (overlap <= 0) continue;
    pushCandidate(market, 100, overlap);
  }

  for (const market of markets) {
    if (String(market.id) === primaryId) continue;
    const overlap = lexicalOverlap(primary.question, market.question);
    if (overlap <= 0) continue;
    pushCandidate(market, 20, overlap);
  }

  return Array.from(scored.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const volumeDelta = parseVolumeForSort(right.market?.volume) - parseVolumeForSort(left.market?.volume);
      if (volumeDelta !== 0) return volumeDelta;
      return String(left.market?.question || '').localeCompare(String(right.market?.question || ''));
    })
    .slice(0, IM_RELATED_MARKETS_LIMIT)
    .map(entry => entry.market);
}

function lexicalOverlap(leftText, rightText) {
  if (typeof tokenizeForMatch !== 'function') return 0;
  const left = new Set(tokenizeForMatch(leftText));
  const right = new Set(tokenizeForMatch(rightText));

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function parseVolumeForSort(volumeLabel) {
  const raw = String(volumeLabel || '').toUpperCase().replaceAll(',', '').trim();
  if (!raw) return 0;
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*([KMB])?/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const suffix = match[2] || '';
  if (suffix === 'B') return value * 1_000_000_000;
  if (suffix === 'M') return value * 1_000_000;
  if (suffix === 'K') return value * 1_000;
  return value;
}

function renderResearchCard(research) {
  if (research?.type === 'thesis') {
    if (research.status === 'loading') {
      return renderThesisLoadingCard(research);
    }
    if (research.thesis) {
      return renderThesisCard(research);
    }
  }

  const terms = Array.isArray(research.matchedTerms) ? research.matchedTerms : [];
  const steps = Array.isArray(research.steps) ? research.steps : [];
  const confidence = Number.isFinite(research.confidence) ? research.confidence : 0;
  const method = typeof research.method === 'string' ? research.method : 'Parser';

  return `
    <div class="im-risk-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div class="im-market-title">${escapeHtml(research.title || 'Market research')}</div>
        <div style="font-size:11px;color:var(--pm-blue);font-weight:700;">${confidence}% confidence</div>
      </div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        ${escapeHtml(research.summary || 'No summary available.')}
      </div>
      <div style="font-size:11px;color:var(--pm-blue);font-weight:600;">
        Method: ${escapeHtml(method)}
      </div>
      ${terms.length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${terms.map(term => `<span class="im-best-match-badge" style="border-color:var(--pm-blue);color:var(--pm-blue);background:rgba(59,130,246,0.12);">${escapeHtml(term)}</span>`).join('')}
        </div>
      ` : ''}
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${steps.map((step, index) => `
          <div class="im-reasoning-step" style="border-bottom:none;padding:0;">
            <span class="step-num">${index + 1}.</span>
            <span>${escapeHtml(step)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderThesisLoadingCard(research) {
  const completed = Array.isArray(research.completedSteps) ? research.completedSteps : [];
  const current = research.summary || 'Working...';

  return `
    <div class="im-risk-panel">
      <div class="im-market-title">${escapeHtml(research.title || 'Running thesis engine...')}</div>
      <div class="im-research-log">
        ${completed.map(step => `
          <div class="im-research-log-row done">
            <span class="im-research-log-icon">&#10003;</span>
            <span class="im-research-log-text">${escapeHtml(step)}</span>
          </div>
        `).join('')}
        <div class="im-research-log-row active">
          <span class="im-research-log-spinner"></span>
          <span class="im-research-log-text">${escapeHtml(current)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderThesisCard(research) {
  const thesis = research.thesis || {};
  const dossier = research.dossier || {};
  const allSources = Array.isArray(dossier.all_sources) ? dossier.all_sources : [];
  const topSources = Array.isArray(dossier.top_sources) ? dossier.top_sources : [];
  const effectiveSources = coalesceSources(allSources, topSources);
  const briefingLines = Array.isArray(dossier.briefing_lines) ? dossier.briefing_lines : [];
  const fairProbability = Number.isFinite(Number(thesis.fair_probability)) ? Number(thesis.fair_probability) : 0;
  const confidence = Number.isFinite(Number(thesis.confidence)) ? Number(thesis.confidence) : 0;
  const suggestedAmount = Number.isFinite(Number(thesis.suggested_amount_usdc)) ? Number(thesis.suggested_amount_usdc) : 0;
  const suggestedAction = thesis.suggested_action === 'YES' || thesis.suggested_action === 'NO' || thesis.suggested_action === 'SKIP'
    ? thesis.suggested_action
    : 'SKIP';
  const marketId = String(thesis.market_id || IM_ACTIVE_MARKET_ID || '');
  const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
  const defaultTradeSide = suggestedAction === 'SKIP' ? 'YES' : suggestedAction;
  const maxStopLoss = Number.isFinite(Number(thesis.stop_loss_cents)) ? Number(thesis.stop_loss_cents) : 15;
  const sourceCounts = normalizeSourceCounts(dossier.source_counts || {}, effectiveSources);
  const reportId = dossier.report_id || '';

  // Derived
  const yesOdds = Number.isFinite(Number(market?.yesOdds)) ? Number(market.yesOdds) : null;
  const edge = yesOdds !== null ? fairProbability - yesOdds : null;
  const conviction = confidence >= 75 ? 'High' : confidence >= 60 ? 'Medium' : 'Low';
  const sourceCoverage = Object.values(sourceCounts).reduce((a, b) => a + Number(b), 0);
  const evidenceQuality = sourceCoverage >= 15 ? 'Strong' : sourceCoverage >= 8 ? 'Moderate' : 'Thin';

  // Scenarios
  const baseCase = fairProbability;
  const bullCase = Math.min(99, fairProbability + Math.max(3, (100 - confidence) * 0.25));
  const bearCase = Math.max(1, fairProbability - Math.max(3, (100 - confidence) * 0.25));

  const convDotClass = conviction === 'High' ? 'im2-dot--yes' : conviction === 'Medium' ? 'im2-dot--skip' : 'im2-dot--no';
  const evBars = evidenceQuality === 'Strong' ? 3 : evidenceQuality === 'Moderate' ? 2 : 1;
  const biasArrow = suggestedAction === 'YES' ? '↗' : suggestedAction === 'NO' ? '↘' : '→';

  return `
    <div class="im2-report-panel">
      <div class="im2-report-header">
        <span class="im2-report-label">REPORT</span>
        <span class="im2-report-sep">·</span>
        <span class="im2-report-id">${escapeHtml(reportId || (marketId ? marketId.slice(0, 24) : 'n/a'))}</span>
      </div>

      <div class="im2-report-title">${escapeHtml(research.title || thesis.market_id || 'AI Thesis')}</div>

      <div class="im2-signal-row">
        <div class="im2-bias-badge im2-bias-badge--${suggestedAction.toLowerCase()}">${biasArrow} ${escapeHtml(suggestedAction)}</div>
        <div class="im2-conviction-group">
          <span class="im2-dot ${convDotClass}"></span>
          <span class="im2-conviction-label">${escapeHtml(conviction)} conviction</span>
        </div>
        <div class="im2-evidence-group">
          <div class="im2-evidence-bars">
            ${[1, 2, 3].map(i => `<div class="im2-ev-bar ${i <= evBars ? 'im2-ev-bar--filled' : ''}"></div>`).join('')}
          </div>
          <span class="im2-evidence-label">${escapeHtml(evidenceQuality)}</span>
        </div>
      </div>

      <div class="im2-sep"></div>

      <div class="im2-section-label">FAIR VALUE SCENARIOS</div>
      <div class="im2-scenarios">
        <div class="im2-scenario-row">
          <span class="im2-scenario-name">Base</span>
          <div class="im2-bar-track"><div class="im2-bar-fill im2-bar-fill--base" style="width:${baseCase}%"></div></div>
          <span class="im2-scenario-pct im2-scenario-pct--base">${Math.round(baseCase)}%</span>
        </div>
        <div class="im2-scenario-row">
          <span class="im2-scenario-name">Bull</span>
          <div class="im2-bar-track"><div class="im2-bar-fill im2-bar-fill--bull" style="width:${bullCase}%"></div></div>
          <span class="im2-scenario-pct im2-scenario-pct--bull">${Math.round(bullCase)}%</span>
        </div>
        <div class="im2-scenario-row">
          <span class="im2-scenario-name">Bear</span>
          <div class="im2-bar-track"><div class="im2-bar-fill im2-bar-fill--bear" style="width:${bearCase}%"></div></div>
          <span class="im2-scenario-pct im2-scenario-pct--bear">${Math.round(bearCase)}%</span>
        </div>
      </div>

      <div class="im2-mme-panel">
        <div class="im2-mme-cell">
          <div class="im2-mme-label">MARKET</div>
          <div class="im2-mme-value">${yesOdds !== null ? Math.round(yesOdds) + '%' : '—'}</div>
        </div>
        <div class="im2-mme-div"></div>
        <div class="im2-mme-cell">
          <div class="im2-mme-label">MODEL</div>
          <div class="im2-mme-value">${Math.round(fairProbability)}%</div>
        </div>
        <div class="im2-mme-div"></div>
        <div class="im2-mme-cell">
          <div class="im2-mme-label">EDGE</div>
          <div class="im2-mme-value ${edge !== null ? (edge >= 0 ? 'im2-mme-yes' : 'im2-mme-no') : ''}">${edge !== null ? (edge >= 0 ? '+' : '') + Math.round(edge) + ' pts' : '—'}</div>
        </div>
      </div>

      <div class="im2-explanation">${escapeHtml(thesis.explanation || research.summary || 'No thesis explanation provided.')}</div>

      <div class="im2-sep"></div>
      <div class="im2-section-label">EXECUTE TRADE</div>
      <div class="im2-trade-panel" data-market-id="${escapeHtml(marketId)}">
        <div class="im2-trade-toggle">
          <button class="im2-trade-btn ${defaultTradeSide === 'YES' ? 'im2-trade-btn--yes-active' : 'im2-trade-inactive'}" data-im-action="trade-side-toggle" data-im-field="trade-side" data-value="YES">YES</button>
          <button class="im2-trade-btn ${defaultTradeSide === 'NO' ? 'im2-trade-btn--no-active' : 'im2-trade-inactive'}" data-im-action="trade-side-toggle" data-im-field="trade-side" data-value="NO">NO</button>
        </div>
        <div class="im2-amount-wrap">
          <span class="im2-amount-pre">$</span>
          <input class="im2-amount-input" data-im-field="trade-amount" type="number" min="1" step="0.01" value="${Math.max(1, suggestedAmount || 1).toFixed(2)}" />
          <span class="im2-amount-suf">USDC</span>
        </div>
        <div class="im2-stop-row">
          <span class="im2-stop-icon">◎</span>
          <span class="im2-stop-text">Stop loss: <span class="im2-stop-val">${maxStopLoss}c</span></span>
        </div>
        <button class="im2-cta-btn im2-cta-btn--active" data-im-action="research-place-bet" data-market-id="${escapeHtml(marketId)}">
          Place Bet${suggestedAction === 'SKIP' ? ' (Model says SKIP)' : ` ${escapeHtml(suggestedAction)}`}
        </button>
        ${market?.polymarketUrl ? `<a class="im2-poly-link" href="${escapeHtml(market.polymarketUrl)}" target="_blank" rel="noopener noreferrer">↗ Open on Polymarket</a>` : ''}
      </div>

      <div class="im2-sep"></div>
      <div class="im2-bottom-actions">
        <button class="im2-bottom-btn" data-im-action="refresh-live-markets">↺ Refresh Live Markets</button>
        <button class="im2-bottom-btn" data-im-action="download-research-pdf" data-market-id="${escapeHtml(marketId)}">↓ PDF</button>
        <button class="im2-bottom-btn" data-im-action="toggle-full-research" data-market-id="${escapeHtml(marketId)}">${research.showFullData ? 'Hide Details' : 'Show Full Research'}</button>
      </div>

      ${research.showFullData ? renderFullResearchData({
    thesis,
    market,
    reportId,
    isFallback: Boolean(dossier.is_fallback),
    briefingLines,
    sourceCounts,
    allSources: effectiveSources,
    collectionErrors: Array.isArray(dossier.collection_errors) ? dossier.collection_errors : [],
    suggestedAction,
    suggestedAmount,
    marketId,
  }) : ''}
      
      ${renderOrderBook(research.orderBook, research.simulation)}
      
      ${renderSimulationData(research.simulation)}
      
    </div>
  `;
}

function renderFullResearchData(data) {
  const thesis = data?.thesis || {};
  const allSources = Array.isArray(data?.allSources) ? data.allSources : [];
  const sourceCounts = data?.sourceCounts || {};
  const briefingLines = Array.isArray(data?.briefingLines)
    ? data.briefingLines.filter((line) => !isNoisyScraperLine(line))
    : [];
  const isFallback = Boolean(data?.isFallback);
  const suggestedAction = data?.suggestedAction || 'SKIP';
  const suggestedAmount = Number(data?.suggestedAmount || 0);

  const coverageOrder = ['news', 'google', 'x', 'tiktok', 'reddit', 'youtube'];
  const coverageLabels = { news: 'News', google: 'Google', x: 'X', tiktok: 'TikTok', reddit: 'Reddit', youtube: 'YouTube' };
  const coverageItems = coverageOrder
    .map(key => ({ key, label: coverageLabels[key], count: Number(sourceCounts[key] || 0) }))
    .filter(item => item.count > 0);

  const agentDecision = suggestedAction === 'SKIP'
    ? 'SKIP $0.00'
    : `${suggestedAction} $${suggestedAmount.toFixed(2)}`;
  const decisionClass = suggestedAction === 'YES' ? 'im2-pipeline-yes' : suggestedAction === 'NO' ? 'im2-pipeline-no' : 'im2-pipeline-skip';

  const BRIEFING_INIT = 4;
  const hasBriefingMore = briefingLines.length > BRIEFING_INIT;
  const briefingId = 'im2-briefing-' + String(data?.reportId || 'r').replace(/[^a-z0-9]/gi, '');

  return `
    <div class="im2-sep"></div>

    <div class="im2-section-header-row">
      <span class="im2-section-label">AGENT PIPELINE</span>
      <span class="im2-pipeline-decision ${decisionClass}">${escapeHtml(agentDecision)}</span>
      <span class="im2-chevron">▾</span>
    </div>

    ${isFallback && allSources.length === 0 ? `<div class="im2-warning">Research pipeline is degraded right now.</div>` : ''}

    ${coverageItems.length ? `
      <div class="im2-section-label" style="margin-top:10px;">COVERAGE</div>
      <div class="im2-coverage-pills">
        ${coverageItems.map(item => `
          <div class="im2-coverage-pill">
            <span class="im2-cov-label">${escapeHtml(item.label)}</span>
            <span class="im2-cov-count">${item.count}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${briefingLines.length ? `
      <div class="im2-section-label" style="margin-top:10px;">BRIEFING</div>
      <div class="im2-briefing-list">
        ${briefingLines.slice(0, BRIEFING_INIT).map((line, idx) => {
    const st = getBriefingSourceType(line, allSources, idx);
    return `<div class="im2-briefing-item"><span class="im2-src-tag im2-src-tag--${st}">${escapeHtml(st.toUpperCase())}</span><span class="im2-briefing-text">${escapeHtml(line)}</span></div>`;
  }).join('')}
        ${hasBriefingMore ? `
          <div class="im2-briefing-more" id="${escapeHtml(briefingId)}" style="display:none;flex-direction:column;gap:8px;">
            ${briefingLines.slice(BRIEFING_INIT).map((line, idx) => {
    const st = getBriefingSourceType(line, allSources, BRIEFING_INIT + idx);
    return `<div class="im2-briefing-item"><span class="im2-src-tag im2-src-tag--${st}">${escapeHtml(st.toUpperCase())}</span><span class="im2-briefing-text">${escapeHtml(line)}</span></div>`;
  }).join('')}
          </div>
          <button class="im2-briefing-toggle" data-im-action="toggle-briefing" data-briefing-id="${escapeHtml(briefingId)}" data-expanded="0">∨ Show more</button>
        ` : ''}
      </div>
    ` : ''}

    <div class="im2-sep"></div>
    <div class="im2-section-header-row">
      <span class="im2-section-label">SOURCES</span>
      <span class="im2-sources-count">${allSources.length} total</span>
      <span class="im2-chevron">▴</span>
    </div>
    <div class="im2-sources-list">
      ${allSources.length ? allSources.map(source => {
    const rel = Number(source.relevance_score) || 0;
    const relClass = rel >= 0.7 ? 'im2-rel--high' : rel >= 0.5 ? 'im2-rel--mid' : 'im2-rel--low';
    const st = String(source.source_type || 'unknown').toLowerCase();
    const sourceUrl = sanitizePostUrl(source.url || '');
    const sourceActionAttrs = sourceUrl
      ? ` data-im-action="open-source-link" data-source-url="${escapeHtml(sourceUrl)}" title="Open source website" role="button" tabindex="0"`
      : '';
    return `
          <div class="im2-source-card ${sourceUrl ? 'im2-source-card-link' : ''}"${sourceActionAttrs}>
            <div class="im2-source-header">
              <span class="im2-source-dot im2-source-dot--${st}"></span>
              <span class="im2-source-platform">${escapeHtml(st.toUpperCase())}</span>
              <span class="im2-rel-score ${relClass}">Rel ${rel.toFixed(2)}</span>
            </div>
            <div class="im2-source-title">${escapeHtml(source.title || 'Untitled source')}</div>
            ${(source.snippet || source.raw_text) ? `<div class="im2-source-snippet">${escapeHtml((source.snippet || source.raw_text || '').slice(0, 150))}</div>` : ''}
          </div>
        `;
  }).join('') : '<div class="im2-muted">No sources available.</div>'}
    </div>
  `;
}

function normalizeSourceCounts(sourceCounts, allSources) {
  const normalized = {
    x: Number(sourceCounts?.x ?? 0),
    youtube: Number(sourceCounts?.youtube ?? 0),
    reddit: Number(sourceCounts?.reddit ?? 0),
    news: Number(sourceCounts?.news ?? 0),
    google: Number(sourceCounts?.google ?? 0),
    tiktok: Number(sourceCounts?.tiktok ?? 0),
  };

  const allZero = Object.values(normalized).every(value => value <= 0);
  if (!allZero || !Array.isArray(allSources) || allSources.length === 0) {
    return normalized;
  }

  for (const source of allSources) {
    const type = String(source?.source_type || "").toLowerCase();
    if (type in normalized) {
      normalized[type] += 1;
    }
  }
  return normalized;
}

function renderExecutiveBrief() {
  return '';
}

function renderAgentInteractionGraph(thesis) {
  const analystNotes = thesis?.analyst_notes || {};
  const marketSummary = String(analystNotes.market_analyst?.summary || "Market structure pass complete.");
  const evidenceSummary = String(analystNotes.evidence_analyst?.summary || "Evidence weighting complete.");
  const resolutionSummary = String(analystNotes.resolution_analyst?.summary || "Resolution/rules pass complete.");
  const pmSummary = String(analystNotes.pm_synthesizer?.summary || thesis?.explanation || "Portfolio synthesis complete.");
  const decision = thesis?.suggested_action === "YES" || thesis?.suggested_action === "NO" || thesis?.suggested_action === "SKIP"
    ? thesis.suggested_action
    : "SKIP";
  const amount = Number.isFinite(Number(thesis?.suggested_amount_usdc)) ? Number(thesis.suggested_amount_usdc).toFixed(2) : "0.00";

  return `
    <div>
      <div class="im-thesis-section-title">Agent Interaction Graph</div>
      <div class="im-agent-graph-wrap">
        <svg class="im-agent-graph-lines" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          <line x1="22" y1="16" x2="50" y2="36"></line>
          <line x1="50" y1="16" x2="50" y2="36"></line>
          <line x1="78" y1="16" x2="50" y2="36"></line>
          <line x1="50" y1="36" x2="50" y2="58"></line>
        </svg>
        <div class="im-agent-graph-node im-a-node-market">Market Analyst</div>
        <div class="im-agent-graph-node im-a-node-evidence">Evidence Analyst</div>
        <div class="im-agent-graph-node im-a-node-resolution">Resolution Analyst</div>
        <div class="im-agent-graph-node im-a-node-pm">PM Synthesizer</div>
        <div class="im-agent-graph-node im-a-node-decision">Decision: ${escapeHtml(decision)} $${escapeHtml(amount)}</div>
      </div>
      <div class="im-agent-thread">
        <div class="im-agent-thread-item"><span>Market:</span> ${escapeHtml(marketSummary)}</div>
        <div class="im-agent-thread-item"><span>Evidence:</span> ${escapeHtml(evidenceSummary)}</div>
        <div class="im-agent-thread-item"><span>Resolution:</span> ${escapeHtml(resolutionSummary)}</div>
        <div class="im-agent-thread-item"><span>PM:</span> ${escapeHtml(pmSummary)}</div>
      </div>
    </div>
  `;
}

function coalesceSources(allSources, topSources) {
  const normalizedAll = normalizeSources(allSources);
  if (normalizedAll.length) return normalizedAll;
  const normalizedTop = normalizeSources(topSources);
  return normalizedTop;
}

function normalizeSources(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => ({
      id: String(item?.id || ''),
      source_type: String(item?.source_type || 'unknown'),
      title: String(item?.title || ''),
      url: String(item?.url || ''),
      snippet: String(item?.snippet || ''),
      raw_text: String(item?.raw_text || item?.snippet || ''),
      relevance_score: Number(item?.relevance_score) || 0,
      published_at: String(item?.published_at || ''),
      provider: String(item?.provider || ''),
      query: String(item?.query || ''),
      author: String(item?.author || '')
    }))
    .filter(item => item.title || item.url || item.snippet || item.raw_text);
}

function getBriefingSourceType(line, allSources, idx) {
  if (!Array.isArray(allSources)) return 'news';
  const lower = String(line || '').toLowerCase();
  for (const src of allSources) {
    const t = String(src?.title || '').toLowerCase();
    if (t.length >= 15 && lower.includes(t.slice(0, 15))) {
      return String(src.source_type || 'news').toLowerCase();
    }
  }
  if (allSources.length > 0) {
    return String(allSources[idx % allSources.length]?.source_type || 'news').toLowerCase();
  }
  return 'news';
}

function renderResearchPlaceholder(primaryMarket) {
  return `
    <div class="im-risk-panel">
      <div class="im-market-title">No research yet</div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        Click <strong>Research</strong> on a matching story to store live parser evidence for "${escapeHtml(primaryMarket.question)}".
      </div>
    </div>
  `;
}

function renderPortfolioResearchSection() {
  if (!IM_ACTIVE_MARKET_ID) {
    return `
      <div class="im-risk-panel">
        <div class="im-market-title">No research yet</div>
        <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
          Click <strong>Research</strong> on a matching story card to load AI thesis and evidence here.
        </div>
      </div>
    `;
  }

  const research = getMarketResearch(IM_ACTIVE_MARKET_ID);
  if (!research) {
    const market = typeof getMarketById === 'function' ? getMarketById(IM_ACTIVE_MARKET_ID) : null;
    return market ? renderResearchPlaceholder(market) : `
      <div class="im-risk-panel">
        <div class="im-market-title">No research yet</div>
        <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
          Click <strong>Research</strong> on a matching story card to load AI thesis and evidence here.
        </div>
      </div>
    `;
  }

  return renderResearchCard(research);
}

function renderMarketCard(market, isBest) {
  const marketUrl = sanitizePostUrl(market.polymarketUrl || '');
  const marketLink = market.polymarketUrl
    ? `<a href="${escapeHtml(market.polymarketUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--pm-blue);text-decoration:none;">Open ↗</a>`
    : '';
  const cardActionAttrs = marketUrl
    ? ` data-im-action="open-market-link" data-market-url="${escapeHtml(marketUrl)}" title="Open market on Polymarket" role="button" tabindex="0"`
    : '';

  return `
    <div class="im-market-card ${isBest ? 'best-match' : ''} ${marketUrl ? 'im-market-card-link' : ''}"${cardActionAttrs}>
      ${isBest ? '<div class="im-best-match-badge">Best Match</div>' : ''}
      <div class="im-market-title">${escapeHtml(market.question)}</div>
      <div class="im-market-meta">
        <span>${escapeHtml(market.volume || '$0 Vol')}</span>
        ${market.category ? `<span>· ${escapeHtml(market.category)}</span>` : ''}
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
      'No saved markets yet',
      'Use the Save button on matched story cards or market cards to track markets over time.'
    );
  }

  return saved.map(item => {
    const currentYes = Number.isFinite(item.currentYesOdds) ? item.currentYesOdds : item.savedYesOdds;
    const currentNo = Number.isFinite(item.currentNoOdds) ? item.currentNoOdds : item.savedNoOdds;
    const postUrl = sanitizePostUrl(item?.postUrl || '');
    const rowActionAttrs = postUrl
      ? ` data-im-action="open-saved-post" data-post-url="${escapeHtml(postUrl)}" title="Open saved source page" role="button" tabindex="0"`
      : '';

    let deltaHtml = '<span style="font-size:12px;color:var(--pm-text-secondary);">Current odds unavailable.</span>';
    if (Number.isFinite(item.currentYesOdds)) {
      const delta = item.currentYesOdds - item.savedYesOdds;
      const favorable = delta >= 0;
      deltaHtml = `
        <div class="im-saved-delta ${favorable ? 'up' : 'down'}">
          <span class="${favorable ? 'im-arrow-up' : 'im-arrow-down'}"></span>
          ${favorable ? '+' : ''}${delta}% since saved
        </div>
      `;
    }

    return `
      <div class="im-saved-row ${postUrl ? 'im-saved-row-link' : ''}"${rowActionAttrs}>
        <div class="im-market-title">${escapeHtml(item.question)}</div>
        <div class="im-market-meta">
          <span>Saved ${formatTimestamp(item.savedAt)}</span>
          <span style="margin-left:4px;">· Saved at ${item.savedYesOdds}% YES</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          ${deltaHtml}
          <span style="font-size:11px;color:var(--pm-text-secondary);">${escapeHtml(item.currentVolume || item.savedVolume || '$0 Vol')}</span>
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
  }).join('');
}

function bindSidebarEvents() {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar || sidebar.dataset.imBound === '1') {
    return;
  }
  sidebar.dataset.imBound = '1';

  sidebar.addEventListener('click', async event => {
    const target = event.target.closest('[data-im-action]');
    if (!target) return;

    const action = target.getAttribute('data-im-action');
    const marketId = target.getAttribute('data-market-id');
    const side = target.getAttribute('data-side');

    if (action === 'save-market' && marketId) {
      const saved = saveMarketForLater(marketId);
      showToast(saved ? 'Market saved.' : 'Market already saved.');
      rerenderSavedTabIfVisible();
      return;
    }

    if (action === 'open-bet-post') {
      const postUrl = sanitizePostUrl(target.getAttribute('data-post-url') || '');
      if (!postUrl) {
        showToast('No post URL saved for this bet.');
        return;
      }
      const opened = openUrlInNewTab(postUrl);
      if (!opened) {
        showToast('Could not open post in a new tab.');
      }
      return;
    }

    if (action === 'open-saved-post') {
      const postUrl = sanitizePostUrl(target.getAttribute('data-post-url') || '');
      if (!postUrl) {
        showToast('No post URL saved for this market.');
        return;
      }
      const opened = openUrlInNewTab(postUrl);
      if (!opened) {
        showToast('Could not open post in a new tab.');
      }
      return;
    }

    if (action === 'open-market-link') {
      if (event.target?.closest?.('a[href]')) {
        return;
      }

      const marketUrl = sanitizePostUrl(target.getAttribute('data-market-url') || '');
      if (!marketUrl) {
        showToast('No Polymarket URL available for this market.');
        return;
      }
      const opened = openUrlInNewTab(marketUrl);
      if (!opened) {
        showToast('Could not open Polymarket in a new tab.');
      }
      return;
    }

    if (action === 'open-source-link') {
      if (event.target?.closest?.('a[href]')) {
        return;
      }

      const sourceUrl = sanitizePostUrl(target.getAttribute('data-source-url') || '');
      if (!sourceUrl) {
        showToast('No source URL available.');
        return;
      }
      const opened = openUrlInNewTab(sourceUrl);
      if (!opened) {
        showToast('Could not open source in a new tab.');
      }
      return;
    }

    if (action === 'show-bet-amount') {
      const sideLabel = target.getAttribute('data-side') === 'NO' ? 'NO' : 'YES';
      const amountRaw = Number(target.getAttribute('data-amount'));
      const hasAmount = Number.isFinite(amountRaw) && amountRaw > 0;
      showToast(
        hasAmount
          ? `${sideLabel} bet: $${Math.round(amountRaw).toLocaleString('en-US')}`
          : `${sideLabel} bet amount unavailable`
      );
      return;
    }

    // Other sidebar-specific actions here...

    if (action === 'refresh-live-markets') {
      if (typeof loadPolymarketMarketUniverse !== 'function') {
        showToast('Live market loader unavailable.');
        return;
      }
      try {
        await loadPolymarketMarketUniverse({ limit: 2200, pageSize: 500, maxPages: 6 });
        showToast('Live markets refreshed.');
        rerenderMarketsTab();
      } catch {
        showToast('Refresh failed.');
      }
    }

    if (action === 'toggle-full-research' && marketId) {
      const existing = getMarketResearch(marketId);
      if (!existing || existing.type !== 'thesis') {
        showToast('No full research loaded yet.');
        return;
      }
      setMarketResearch(marketId, {
        ...existing,
        showFullData: !existing.showFullData
      });
      rerenderPortfolioTabIfVisible();
      return;
    }

    if (action === 'download-research-pdf' && marketId) {
      const success = downloadResearchPdf(marketId);
      showToast(success ? 'PDF view opened. Use Save as PDF.' : 'No research data available for PDF.');
      return;
    }

    if (action === 'trade-side-toggle') {
      const panel = target.closest('.im2-trade-panel');
      if (!panel) return;
      panel.querySelectorAll('[data-im-field="trade-side"]').forEach(btn => {
        btn.classList.remove('im2-trade-btn--yes-active', 'im2-trade-btn--no-active');
        btn.classList.add('im2-trade-inactive');
      });
      target.classList.remove('im2-trade-inactive');
      const val = target.getAttribute('data-value');
      target.classList.add(val === 'NO' ? 'im2-trade-btn--no-active' : 'im2-trade-btn--yes-active');
      return;
    }

    if (action === 'toggle-briefing') {
      const briefingId = target.getAttribute('data-briefing-id');
      const moreDiv = briefingId ? document.getElementById(briefingId) : null;
      if (!moreDiv) return;
      const expanded = target.getAttribute('data-expanded') === '1';
      if (expanded) {
        moreDiv.style.display = 'none';
        target.textContent = '∨ Show more';
        target.setAttribute('data-expanded', '0');
      } else {
        moreDiv.style.display = 'flex';
        target.textContent = '∧ Show less';
        target.setAttribute('data-expanded', '1');
      }
      return;
    }

    if (action === 'research-place-bet' && marketId) {
      const panel = target.closest('.im2-trade-panel');
      if (!panel) return;

      const amountInput = panel.querySelector('[data-im-field="trade-amount"]');
      const activeSideBtn = panel.querySelector('.im2-trade-btn--yes-active, .im2-trade-btn--no-active');
      const amount = Number(amountInput?.value || 0);
      const side = activeSideBtn?.getAttribute('data-value') === 'NO' ? 'NO' : 'YES';
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Enter a valid USDC amount.');
        return;
      }

      const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
      if (!market) return;

      const yesPricePct = Number(market.yesOdds) || 50;
      const noPricePct = Number(market.noOdds) || 50;
      const pricePct = side === 'YES' ? yesPricePct : noPricePct;
      const shares = Math.max(1, amount / Math.max(pricePct / 100, 0.01));

      const research = typeof getMarketResearch === 'function' ? getMarketResearch(marketId) : null;
      const simProb = research?.simulation?.simulatedYesPct;

      executeResolutionTrade(target, {
        marketId,
        side,
        shares,
        price: pricePct,
        amount,
        simProbability: simProb,
        question: market.question
      });
      return;
    }
  });

  async function executeResolutionTrade(buttonEl, data) {
    const { marketId, side, shares, price, amount, simProbability, question } = data;
    
    // Immediate Visuals: Original Toast Confirmation
    const questionLabel = question ? `on "${question.slice(0, 30)}..."` : '';
    showToast(`Bet placed: $${amount.toFixed(0)} ${side} ${questionLabel}`);
    
    // We remove the initial 0-placeholder to prevent the "multiple numbers" clutter
    // The Rising PnL Billboard will fire once the real CLOB math resolves.
    
    const walletAddress = getWalletAddress();
    const payload = {
      walletAddress,
      marketId: String(marketId),
      side,
      shares,
      price: Number(price.toFixed(2)),
      simProbability
    };

    // Show local PnL prediction while sync happens
    recordSidebarBet(marketId, side, amount);
    rerenderPortfolioTabIfVisible();
    
    // Logic: Do the gacha AFTER the bridge returns real CLOB math
    try {
      const response = await submitBetToBridge(payload);
      if (response && response.resolutionReceipt) {
        // Gacha Stage 2: Billboard & Receipt (The 'Dopamine' payoff)
        createFloatingPnL(buttonEl, response.resolutionReceipt.pnl, response.resolutionReceipt.status === 'WINNER');
        showResolutionReceiptCard(response.resolutionReceipt);
      } else {
        showToast(`Executed ${side} trade.`);
      }
    } catch (err) {
      console.warn('[InstaMarket] Universal Resolution Sync failed:', err);
      // Fallback Gacha if bridge down but user wants dopamine
      const won = Math.random() > 0.5;
      createFloatingPnL(buttonEl, won ? amount * 0.4 : -amount, won);
    }
  }

  function showResolutionReceiptCard(receipt) {
    const overlay = document.createElement('div');
    overlay.className = 'im2-receipt-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:20000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px);';
    
    const won = receipt.status === 'WINNER';
    const pnlColor = won ? '#00ba7c' : '#f91880';
    const accentColor = won ? '#00ba7c' : '#f91880';
    const statusSign = Number(receipt.pnl) >= 0 ? '+' : '';
    const glowClass = won ? 'im-glow-pulse' : 'im-glow-pulse-red';

    overlay.innerHTML = `
      <div class="im2-receipt-card ${glowClass}" style="background:#15202b; border:2px solid ${accentColor}44; width:90%; max-width:320px; border-radius:16px; padding:20px; box-shadow:0 12px 40px rgba(0,0,0,0.5); font-family:var(--im-font); position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; width:100%; height:4px; background:${accentColor};"></div>
        
        <div style="text-align:center; margin-bottom:15px; padding-top:10px;">
          <div style="font-size:11px; color:#8899a6; letter-spacing:1px; font-weight:bold; margin-bottom:4px;">SETTLEMENT RECEIPT</div>
          <div style="font-size:24px; font-weight:900; color:${pnlColor};">${receipt.status}</div>
        </div>
        
        <div style="background:rgba(255,255,255,0.03); border-radius:12px; padding:15px; margin-bottom:15px; border:1px solid rgba(255,255,255,0.05);">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#8899a6; font-size:12px;">Outcome</span>
            <span style="color:#fff; font-weight:bold; font-size:12px;">RESOLVED ${receipt.outcome}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#8899a6; font-size:12px;">Shares filled</span>
            <span style="color:#fff; font-weight:bold; font-size:12px;">${receipt.shares}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#8899a6; font-size:12px;">Avg Entry</span>
            <span style="color:#fff; font-weight:bold; font-size:12px;">${receipt.avgPrice}¢</span>
          </div>
          <div style="height:1px; background:rgba(255,255,255,0.08); margin:10px 0;"></div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <span style="color:#8899a6; font-size:12px;">Realized PnL</span>
            <span style="color:${pnlColor}; font-weight:900; font-size:22px; filter: drop-shadow(0 0 8px ${pnlColor}44);">${statusSign}$${receipt.pnl}</span>
          </div>
        </div>

        <div style="font-size:10px; color:#8899a6; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; line-height:1.4; margin-bottom:20px; border-left:2px solid ${pnlColor};">
          <strong style="color:${pnlColor};">RESOLUTION PROOF:</strong><br/>
          <span style="color:#e7e9ea; opacity:0.8;">${receipt.proof}</span>
        </div>

        <button class="im2-receipt-close" style="width:100%; padding:14px; background:${accentColor}; border:none; border-radius:12px; color:#fff; font-weight:900; cursor:pointer; font-size:14px; transition: transform 0.1s; box-shadow: 0 4px 12px ${accentColor}44;">CLOSE SETTLEMENT</button>
      </div>
    `;

    overlay.querySelector('.im2-receipt-close').onclick = () => overlay.remove();
    overlay.querySelector('.im2-receipt-close').onmousedown = (e) => e.target.style.transform = 'scale(0.97)';
    overlay.querySelector('.im2-receipt-close').onmouseup = (e) => e.target.style.transform = 'scale(1)';
    
    document.body.appendChild(overlay);
  }

  // CLOB order book animation — fires when user expands the details element
  sidebar.addEventListener('toggle', event => {
    const el = event.target;
    if (!el || !el.classList.contains('im2-ob-details') || !el.open) return;
    const id = el.id;
    if (id && CLOB_ANIM[id]) {
      const decisions = CLOB_ANIM[id];
      delete CLOB_ANIM[id]; // play once, then auto-free
      playOrderBookAnimation(id, decisions);
    }
  }, true); // capture phase so toggle fires on the element directly

  sidebar.addEventListener('keydown', event => {
    const target = event.target?.closest?.('[data-im-action="open-bet-post"], [data-im-action="open-saved-post"], [data-im-action="open-market-link"], [data-im-action="open-source-link"]');
    if (!target) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      target.click();
    }
  });

  document.querySelectorAll('.im-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      if (!tabName) return;

      document.querySelectorAll('.im-tab').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.im-tab-content').forEach(item => item.classList.remove('active'));

      tab.classList.add('active');
      const content = document.getElementById(`im-tab-${tabName}`);
      if (!content) return;

      if (tabName === 'portfolio') {
        content.innerHTML = renderPortfolioTab();
      } else if (tabName === 'markets') {
        content.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
      } else if (tabName === 'saved') {
        content.innerHTML = renderSavedTab();
      }

      content.classList.add('active');
    });
  });
}

function rerenderMarketsTab() {
  const content = document.getElementById('im-tab-markets');
  if (!content) return;
  content.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
}

function rerenderSavedTabIfVisible() {
  const content = document.getElementById('im-tab-saved');
  if (!content || !content.classList.contains('active')) return;
  content.innerHTML = renderSavedTab();
}

function rerenderPortfolioTabIfVisible() {
  const content = document.getElementById('im-tab-portfolio');
  if (!content || !content.classList.contains('active')) return;
  content.innerHTML = renderPortfolioTab();
}

function saveMarketForLater(marketId, meta = {}) {
  if (!marketId) return false;
  const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
  if (!market) return false;
  const normalizedPostUrl = sanitizePostUrl(meta?.postUrl || '');

  const saved = loadJsonLocalStorage(IM_SAVED_MARKETS_KEY, []);
  const existingIndex = saved.findIndex(entry => String(entry.marketId) === String(market.id));
  if (existingIndex >= 0) {
    const existingPostUrl = sanitizePostUrl(saved[existingIndex]?.postUrl || '');
    // Allow re-saving to backfill a missing source post URL.
    if (normalizedPostUrl && !existingPostUrl) {
      saved[existingIndex] = {
        ...saved[existingIndex],
        postUrl: normalizedPostUrl
      };
      storeJsonLocalStorage(IM_SAVED_MARKETS_KEY, saved);
      rerenderSavedTabIfVisible();
      return true;
    }
    return false;
  }

  saved.push({
    marketId: String(market.id),
    question: market.question,
    savedAt: new Date().toISOString(),
    savedYesOdds: Number(market.yesOdds) || 0,
    savedNoOdds: Number(market.noOdds) || 0,
    savedVolume: market.volume || '$0 Vol',
    postUrl: normalizedPostUrl
  });

  while (saved.length > IM_MAX_SAVED_MARKETS) {
    saved.shift();
  }

  storeJsonLocalStorage(IM_SAVED_MARKETS_KEY, saved);
  rerenderSavedTabIfVisible();
  return true;
}

function getSavedMarketsDetailed() {
  const saved = loadJsonLocalStorage(IM_SAVED_MARKETS_KEY, []);

  return saved
    .map(entry => {
      const live = typeof getMarketById === 'function' ? getMarketById(entry.marketId) : null;
      return {
        marketId: String(entry.marketId),
        question: live?.question || entry.question || 'Unknown market',
        savedAt: entry.savedAt,
        savedYesOdds: Number(entry.savedYesOdds) || 0,
        savedNoOdds: Number(entry.savedNoOdds) || 0,
        savedVolume: entry.savedVolume || '$0 Vol',
        postUrl: sanitizePostUrl(entry.postUrl || ''),
        currentYesOdds: live ? Number(live.yesOdds) : NaN,
        currentNoOdds: live ? Number(live.noOdds) : NaN,
        currentVolume: live?.volume || ''
      };
    })
    .reverse();
}

function recordSidebarBet(marketId, side, amount, meta = {}) {
  if (!marketId || (side !== 'YES' && side !== 'NO')) return false;

  const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
  if (!market) return false;
  const normalizedAmount = Math.max(1, Math.round(Number(amount) || 0));
  const normalizedPostUrl = sanitizePostUrl(meta?.postUrl || "");

  const betLog = loadJsonLocalStorage(IM_BET_LOG_KEY, []);
  betLog.push({
    marketId: String(market.id),
    question: market.question,
    side,
    amount: normalizedAmount,
    yesOdds: Number(market.yesOdds) || 0,
    noOdds: Number(market.noOdds) || 0,
    placedAt: new Date().toISOString(),
    postUrl: normalizedPostUrl
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
  const fallbackArray = Array.isArray(fallback) ? fallback : [];
  const fromMemory = IM_STORAGE_MEMORY[key];
  if (Array.isArray(fromMemory)) {
    return cloneJson(fromMemory);
  }
  return loadJsonFromLocalOnly(key, fallbackArray);
}

function storeJsonLocalStorage(key, value) {
  const normalized = Array.isArray(value) ? cloneJson(value) : [];
  IM_STORAGE_MEMORY[key] = normalized;
  writeJsonToLocalOnly(key, normalized);

  if (!isChromeStorageAvailable()) {
    return;
  }

  try {
    chrome.storage.local.set({ [key]: normalized });
  } catch {
    // Ignore extension storage write failures.
  }
}

function initPersistentStateSync() {
  if (IM_STORAGE_SYNC_INITIALIZED) return;
  IM_STORAGE_SYNC_INITIALIZED = true;

  for (const key of IM_PERSISTENT_KEYS) {
    IM_STORAGE_MEMORY[key] = loadJsonFromLocalOnly(key, []);
  }

  if (!isChromeStorageAvailable()) {
    return;
  }

  bindChromeStorageChangeListener();

  try {
    chrome.storage.local.get(IM_PERSISTENT_KEYS, result => {
      const payload = {};
      let changed = false;

      for (const key of IM_PERSISTENT_KEYS) {
        const localEntries = loadJsonFromLocalOnly(key, []);
        const syncedEntries = Array.isArray(result?.[key]) ? result[key] : [];
        const merged = mergePersistentArrays(key, localEntries, syncedEntries);
        payload[key] = merged;
        IM_STORAGE_MEMORY[key] = cloneJson(merged);

        if (!isSameJson(localEntries, merged)) {
          writeJsonToLocalOnly(key, merged);
          changed = true;
        }
      }

      try {
        chrome.storage.local.set(payload);
      } catch {
        // Ignore extension storage write failures.
      }

      if (changed) {
        rerenderPortfolioTabIfVisible();
        rerenderSavedTabIfVisible();
      }
    });
  } catch {
    // Ignore extension storage read failures.
  }
}

function bindChromeStorageChangeListener() {
  if (IM_STORAGE_CHANGE_LISTENER_BOUND) return;
  if (!isChromeStorageAvailable() || !chrome.storage?.onChanged?.addListener) return;
  IM_STORAGE_CHANGE_LISTENER_BOUND = true;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    let changed = false;
    for (const key of IM_PERSISTENT_KEYS) {
      if (!changes[key]) continue;
      const next = Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
      IM_STORAGE_MEMORY[key] = cloneJson(next);
      writeJsonToLocalOnly(key, next);
      changed = true;
    }

    if (changed) {
      rerenderPortfolioTabIfVisible();
      rerenderSavedTabIfVisible();
    }
  });
}

function mergePersistentArrays(key, localEntries, syncedEntries) {
  if (key === IM_SAVED_MARKETS_KEY) {
    return mergeSavedMarkets(localEntries, syncedEntries);
  }
  if (key === IM_BET_LOG_KEY) {
    return mergeBetLogEntries(localEntries, syncedEntries);
  }
  const merged = [...(Array.isArray(localEntries) ? localEntries : []), ...(Array.isArray(syncedEntries) ? syncedEntries : [])];
  return cloneJson(merged);
}

function mergeSavedMarkets(localEntries, syncedEntries) {
  const byMarketId = new Map();
  const combined = [...(Array.isArray(localEntries) ? localEntries : []), ...(Array.isArray(syncedEntries) ? syncedEntries : [])];

  for (const raw of combined) {
    if (!raw || typeof raw !== 'object') continue;
    const marketId = String(raw.marketId || '').trim();
    if (!marketId) continue;

    const entry = { ...raw, marketId, postUrl: sanitizePostUrl(raw.postUrl || '') };
    const existing = byMarketId.get(marketId);
    if (!existing) {
      byMarketId.set(marketId, entry);
      continue;
    }

    const existingTs = Date.parse(existing.savedAt || '') || 0;
    const entryTs = Date.parse(entry.savedAt || '') || 0;
    const newest = entryTs >= existingTs ? entry : existing;
    const oldest = newest === entry ? existing : entry;

    byMarketId.set(marketId, {
      ...oldest,
      ...newest,
      marketId,
      postUrl: sanitizePostUrl(newest.postUrl || oldest.postUrl || '')
    });
  }

  const merged = Array.from(byMarketId.values()).sort((a, b) => (Date.parse(a.savedAt || '') || 0) - (Date.parse(b.savedAt || '') || 0));
  return merged.slice(-IM_MAX_SAVED_MARKETS);
}

function mergeBetLogEntries(localEntries, syncedEntries) {
  const combined = [...(Array.isArray(localEntries) ? localEntries : []), ...(Array.isArray(syncedEntries) ? syncedEntries : [])];
  const seen = new Set();
  const merged = [];

  for (const raw of combined) {
    if (!raw || typeof raw !== 'object') continue;
    const marketId = String(raw.marketId || '').trim();
    const side = raw.side === 'NO' ? 'NO' : (raw.side === 'YES' ? 'YES' : '');
    const placedAt = String(raw.placedAt || '').trim();
    if (!marketId || !side || !placedAt) continue;

    const amount = Number(raw.amount);
    const normalizedAmount = Number.isFinite(amount) ? Math.max(1, Math.round(amount)) : 0;
    const dedupeKey = `${marketId}|${side}|${placedAt}|${normalizedAmount}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    merged.push({
      ...raw,
      marketId,
      side,
      amount: normalizedAmount || raw.amount || 0,
      postUrl: sanitizePostUrl(raw.postUrl || '')
    });
  }

  merged.sort((a, b) => (Date.parse(a.placedAt || '') || 0) - (Date.parse(b.placedAt || '') || 0));
  return merged.slice(-IM_MAX_BET_LOG);
}

function loadJsonFromLocalOnly(key, fallback) {
  const fallbackArray = Array.isArray(fallback) ? fallback : [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneJson(fallbackArray);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? cloneJson(parsed) : cloneJson(fallbackArray);
  } catch {
    return cloneJson(fallbackArray);
  }
}

function writeJsonToLocalOnly(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local storage write failures.
  }
}

function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : value;
  }
}

function isSameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
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
  if (!Number.isFinite(ts)) return 'just now';

  const diffMs = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'just now';
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.max(1, Math.round(diffMs / hour))}h ago`;

  return `${Math.max(1, Math.round(diffMs / day))}d ago`;
}

function sanitizePostUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
}

function openUrlInNewTab(url) {
  const sanitized = sanitizePostUrl(url);
  if (!sanitized) return false;

  try {
    const anchor = document.createElement('a');
    anchor.href = sanitized;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    // Try fallbacks below.
  }

  try {
    const popup = window.open(sanitized, '_blank', 'noopener,noreferrer');
    if (popup) return true;
  } catch {
    // Try extension-background fallback below.
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'IM_OPEN_TAB', url: sanitized });
      return true;
    }
  } catch {
    // Ignore runtime messaging failures.
  }

  return false;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message) {
  let toast = document.getElementById('im-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'im-toast';
    toast.className = 'im-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function getWalletAddress() {
  try {
    const fromStorage = localStorage.getItem('instamarket_wallet_address');
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim();
    }
  } catch {
    // Ignore localStorage errors.
  }
  return 'demo_wallet_extension_user';
}

async function submitBetToBridge(payload) {
  const endpoint = 'http://localhost:3000/api/bet';
  
  // Use proxy fetch via background script to bypass same-origin/mixed-content blocks
  if (typeof fetchJsonWithExtensionSupport === 'function') {
    const response = await fetchJsonWithExtensionSupport(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    // Some worker responses wrap the JSON in .json or return it directly
    const result = response?.json || response;
    if (result && result.success) {
      return result;
    }
    throw new Error(result?.error || 'Bridge request failed');
  }

  // Fallback direct fetch
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Bridge failure (${response.status})`);
  }
  return response.json();
}

function downloadResearchPdf(marketId) {
  try {
    const research = getMarketResearch(marketId);
    if (!research || research.type !== 'thesis' || !research.thesis) {
      return false;
    }

    const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
    const thesis = research.thesis || {};
    const dossier = research.dossier || {};
    const sources = coalesceSources(dossier.all_sources, dossier.top_sources);
    const briefing = Array.isArray(dossier.briefing_lines)
      ? dossier.briefing_lines.filter((line) => !isNoisyScraperLine(line))
      : [];
    const collectionErrors = Array.isArray(dossier.collection_errors)
      ? dossier.collection_errors
        .map((item) => ({
          source_type: String(item?.source_type || "unknown"),
          error: String(item?.error || "Unknown error"),
        }))
        .filter((item) => !isNoisyScraperLine(item.error))
      : [];
    const isFallback = Boolean(dossier.is_fallback);
    const generatedAt = new Date().toISOString();

    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SignalMarket Research Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; line-height: 1.45; }
          h1, h2, h3 { margin: 0 0 10px 0; }
          h1 { font-size: 22px; }
          h2 { font-size: 16px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 12px; }
          p, li { font-size: 12px; }
          .meta { color: #444; margin-bottom: 8px; font-size: 12px; }
          .badge { display: inline-block; border: 1px solid #999; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-right: 6px; }
          .source { border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .source-title { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
          .small { font-size: 11px; color: #555; }
          a { color: #0f4cda; text-decoration: none; }
          .section-gap { margin-top: 14px; }
        </style>
      </head>
      <body>
        <h1>SignalMarket Research Report</h1>
        <div class="meta">Generated: ${escapeHtml(generatedAt)}</div>
        <div class="meta">Market: ${escapeHtml(market?.question || thesis.market_id || 'Unknown market')}</div>
        <div class="meta">Report ID: ${escapeHtml(dossier.report_id || 'n/a')}</div>
        <div class="meta">Fallback: ${isFallback ? 'yes' : 'no'}</div>

        <h2>Thesis Summary</h2>
        <p><span class="badge">Action: ${escapeHtml(thesis.suggested_action || 'SKIP')}</span><span class="badge">Confidence: ${escapeHtml(String(thesis.confidence ?? 'n/a'))}%</span><span class="badge">Fair Prob: ${escapeHtml(String(thesis.fair_probability ?? 'n/a'))}%</span></p>
        <p>${escapeHtml(thesis.explanation || research.summary || 'No explanation available.')}</p>

        <h2>Catalysts</h2>
        <ul>${(Array.isArray(thesis.catalysts) ? thesis.catalysts : []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>None</li>'}</ul>

        <h2>Invalidation</h2>
        <ul>${(Array.isArray(thesis.invalidation) ? thesis.invalidation : []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>None</li>'}</ul>

        <h2>Risk Flags</h2>
        <ul>${(Array.isArray(thesis.risk_flags) ? thesis.risk_flags : []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>None</li>'}</ul>

        <h2>Briefing</h2>
        <ul>${briefing.map(line => `<li>${escapeHtml(line)}</li>`).join('') || '<li>None</li>'}</ul>

        <h2>Collection Errors</h2>
        <ul>${collectionErrors.map(item => `<li>${escapeHtml(String(item.source_type || 'unknown'))}: ${escapeHtml(String(item.error || 'Unknown error'))}</li>`).join('') || '<li>None</li>'}</ul>

        <h2>Evidence Sources (${sources.length})</h2>
        ${sources.map(source => `
          <div class="source">
            <div class="source-title">${escapeHtml(source.title || 'Untitled')}</div>
            <div class="small">${escapeHtml(String(source.source_type || '').toUpperCase())} | relevance ${(Number(source.relevance_score) || 0).toFixed(2)} | ${escapeHtml(source.published_at || '')}</div>
            <div class="small section-gap"><a href="${escapeHtml(source.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url || '')}</a></div>
            <p>${escapeHtml(source.snippet || source.raw_text || '')}</p>
          </div>
        `).join('') || '<p>No sources available.</p>'}
      </body>
    </html>
  `;

    const reportWindow = window.open('about:blank', '_blank');
    if (reportWindow) {
      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
      reportWindow.focus();
      const triggerPrint = () => {
        try {
          reportWindow.print();
        } catch {
          // Ignore print errors.
        }
      };
      reportWindow.addEventListener('load', triggerPrint, { once: true });
      setTimeout(triggerPrint, 400);
      return true;
    }

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `signalmarket_report_${String(marketId || 'market')}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

function switchSidebarToPortfolio(marketId) {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar) {
    createSidebar();
  }

  IM_ACTIVE_MARKET_ID = marketId || IM_ACTIVE_MARKET_ID;
  const portfolioTab = document.querySelector('.im-tab[data-tab="portfolio"]');
  const portfolioContent = document.getElementById('im-tab-portfolio');
  const portfolioAlreadyActive = Boolean(
    portfolioTab?.classList.contains('active') &&
    portfolioContent?.classList.contains('active')
  );

  if (portfolioAlreadyActive && portfolioContent) {
    portfolioContent.innerHTML = renderPortfolioTab();
    return;
  }

  document.querySelectorAll('.im-tab').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.im-tab-content').forEach(item => item.classList.remove('active'));

  if (portfolioTab) {
    portfolioTab.classList.add('active');
  }

  if (portfolioContent) {
    portfolioContent.classList.add('active');
    portfolioContent.innerHTML = renderPortfolioTab();
  }
}

function switchSidebarToMarkets(marketId) {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar) {
    createSidebar();
  }

  IM_ACTIVE_MARKET_ID = marketId || IM_ACTIVE_MARKET_ID;

  document.querySelectorAll('.im-tab').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.im-tab-content').forEach(item => item.classList.remove('active'));

  const marketsTab = document.querySelector('.im-tab[data-tab="markets"]');
  const marketsContent = document.getElementById('im-tab-markets');

  if (marketsTab) {
    marketsTab.classList.add('active');
  }

  if (marketsContent) {
    marketsContent.classList.add('active');
    marketsContent.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
  }
}

function setSidebarActiveMarketFromViewport(marketId) {
  const normalizedId = String(marketId || '').trim();
  if (!normalizedId || normalizedId === String(IM_ACTIVE_MARKET_ID || '')) {
    return;
  }

  IM_ACTIVE_MARKET_ID = normalizedId;
  const marketsContent = document.getElementById('im-tab-markets');
  if (marketsContent && marketsContent.classList.contains('active')) {
    marketsContent.innerHTML = renderMarketsTab(IM_ACTIVE_MARKET_ID);
  }
}

function switchSidebarToSaved() {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar) {
    createSidebar();
  }

  document.querySelectorAll('.im-tab').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.im-tab-content').forEach(item => item.classList.remove('active'));

  const savedTab = document.querySelector('.im-tab[data-tab="saved"]');
  const savedContent = document.getElementById('im-tab-saved');

  if (savedTab) {
    savedTab.classList.add('active');
  }

  if (savedContent) {
    savedContent.classList.add('active');
    savedContent.innerHTML = renderSavedTab();
  }
}
// ── CLOB Animation Engine ─────────────────────────────────────
const CLOB_ANIM = {}; // obId -> decisions []

function buildClobEvents(decisions) {
  // Reconstruct what the CLOB engine would have done step-by-step
  const yesBook = {}; // price -> volume
  const noBook = {};
  const events = [];

  for (const d of decisions) {
    const price = d.decision === 'YES' ? d.confidence : 100 - d.confidence;
    const qty = d.shares || 1;
    const oppPrice = 100 - price;
    let remaining = qty;
    let matched = false;

    if (d.decision === 'YES') {
      for (let p = 1; p <= oppPrice && remaining > 0; p++) {
        if (noBook[p] > 0) {
          const fill = Math.min(remaining, noBook[p]);
          noBook[p] -= fill;
          remaining -= fill;
          if (noBook[p] <= 0) delete noBook[p];
          matched = true;
        }
      }
      if (remaining > 0) yesBook[price] = (yesBook[price] || 0) + remaining;
    } else {
      for (let p = 1; p <= oppPrice && remaining > 0; p++) {
        if (yesBook[p] > 0) {
          const fill = Math.min(remaining, yesBook[p]);
          yesBook[p] -= fill;
          remaining -= fill;
          if (yesBook[p] <= 0) delete yesBook[p];
          matched = true;
        }
      }
      if (remaining > 0) noBook[price] = (noBook[price] || 0) + remaining;
    }

    events.push({
      agent: d,
      price,
      qty,
      matched,
      yes: { ...yesBook },
      no: { ...noBook },
    });
  }
  return events;
}

function renderClobFrame(canvasEl, event, stepIdx, total) {
  const { yes, no, agent, price, matched } = event;
  const isYes = agent.decision === 'YES';

  // Build sorted price levels (top 7 each, highest price first)
  const yesLevels = Object.entries(yes).map(([p, v]) => ({ price: +p, volume: +v })).sort((a, b) => b.price - a.price).slice(0, 7);
  const noLevels = Object.entries(no).map(([p, v]) => ({ price: +p, volume: +v })).sort((a, b) => b.price - a.price).slice(0, 7);
  const maxVol = Math.max(1, ...yesLevels.map(l => l.volume), ...noLevels.map(l => l.volume));

  const bar = (level, side) => {
    const pct = Math.round((level.volume / maxVol) * 100);
    const highlight = level.price === price && !matched ? 'im2-ob-bar-new' : '';
    return `<div class="im2-ob-level">
      <span class="im2-ob-price">${level.price}c</span>
      <div class="im2-ob-bar-track">
        <div class="im2-ob-bar-fill im2-ob-bar--${side} ${highlight}" style="width:${pct}%"></div>
      </div>
      <span class="im2-ob-vol">${level.volume}</span>
    </div>`;
  };

  const totalLiq = Object.values(yes).reduce((s, v) => s + v, 0) + Object.values(no).reduce((s, v) => s + v, 0);

  canvasEl.innerHTML = `
    <div class="im2-ob-ticker ${matched ? 'im2-ob-ticker--match' : (isYes ? 'im2-ob-ticker--yes' : 'im2-ob-ticker--no')}">
      <span class="im2-ob-ticker-name">${escapeHtml(agent.name)}</span>
      <span class="im2-ob-ticker-action">${matched ? '⚡ MATCHED' : (isYes ? '▲ BID YES' : '▼ ASK NO')} @ ${price}c × ${agent.shares || 1}</span>
      <span class="im2-ob-ticker-step">${stepIdx + 1}/${total}</span>
    </div>
    <div class="im2-ob-cols">
      <div class="im2-ob-col">
        <div class="im2-ob-col-header im2-ob-col-header--yes">YES BIDS</div>
        ${yesLevels.length ? yesLevels.map(l => bar(l, 'yes')).join('') : '<div class="im2-ob-empty-col">—</div>'}
      </div>
      <div class="im2-ob-divider"></div>
      <div class="im2-ob-col">
        <div class="im2-ob-col-header im2-ob-col-header--no">NO ASKS</div>
        ${noLevels.length ? noLevels.map(l => bar(l, 'no')).join('') : '<div class="im2-ob-empty-col">—</div>'}
      </div>
    </div>
    <div class="im2-ob-footer">
      <span class="im2-ob-footer-label">Liquidity</span>
      <span class="im2-ob-footer-val">${totalLiq} shares</span>
      <span class="im2-ob-footer-label" style="margin-left:8px;">Open Orders</span>
      <span class="im2-ob-footer-val">${Object.keys(yes).length + Object.keys(no).length} levels</span>
    </div>`;
}

function playOrderBookAnimation(obId, decisions) {
  const details = document.getElementById(obId);
  if (!details) return;
  const canvas = details.querySelector('.im2-ob-canvas');
  if (!canvas) return;

  const events = buildClobEvents(decisions);
  if (!events.length) {
    canvas.innerHTML = '<div class="im2-ob-empty">No agent decisions to replay.</div>';
    return;
  }

  let step = 0;
  canvas.innerHTML = '<div class="im2-ob-empty" style="padding:16px 0;">▶ Replaying swarm orders…</div>';

  function tick() {
    if (step >= events.length) {
      // Final state — show a "done" badge
      const footer = canvas.querySelector('.im2-ob-footer');
      if (footer) {
        const done = document.createElement('span');
        done.className = 'im2-ob-done-badge';
        done.textContent = '✓ Complete';
        footer.appendChild(done);
      }
      return;
    }
    renderClobFrame(canvas, events[step], step, events.length);
    step++;
    setTimeout(tick, 420);
  }
  tick();
}

function renderOrderBook(ob, sim) {
  const hasSim = sim && Array.isArray(sim.decisions) && sim.decisions.length > 0;
  const yesSnap = Array.isArray(ob?.yes) ? ob.yes : [];
  const noSnap = Array.isArray(ob?.no) ? ob.no : [];
  const hasSnap = yesSnap.length > 0 || noSnap.length > 0;

  if (!hasSim && !hasSnap) return '';

  const obId = `im2-ob-${Date.now()}`;
  const label = hasSim ? `${sim.decisions.length} agents · click to replay` : `${yesSnap.length} YES · ${noSnap.length} NO levels`;

  // Store decisions for the toggle handler
  if (hasSim) CLOB_ANIM[obId] = sim.decisions;

  return `
    <div class="im2-sep" style="margin: 12px 0; border-top: 1px solid rgba(255,255,255,0.08);"></div>
    <details class="im2-ob-details" id="${obId}">
      <summary class="im2-ob-summary">
        <span class="im2-ob-title">
          <span class="im2-ob-icon">📊</span>
          CLOB MARKET DEPTH
        </span>
        <span class="im2-ob-meta">${label}</span>
        <span class="im2-ob-chevron">▾</span>
      </summary>
      <div class="im2-ob-body">
        <div class="im2-ob-canvas"></div>
      </div>
    </details>`;
}

function renderSimulationData(sim) {
  if (!sim || !sim.decisions) return '';

  const edgeClass = sim.edgeVsMarket.includes('+') ? 'im2-pipeline-yes' : 'im2-pipeline-no';

  return `
    <div class="im2-sep" style="margin: 15px 0; border-top: 1px solid rgba(255,255,255,0.1);"></div>
    <div class="im2-section-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span class="im2-section-label" style="font-weight:bold; color:#8899a6; font-size:11px; letter-spacing:0.5px;">AI SWARM SIMULATION (${sim.totalAgents} AGENTS)</span>
      <span class="im2-pipeline-decision ${edgeClass}" style="font-size:12px; font-weight:bold; color: ${edgeClass === 'im2-pipeline-yes' ? '#00ba7c' : '#f91880'};">${escapeHtml(sim.edgeVsMarket)}</span>
    </div>
    
    <div class="im2-scenarios" style="margin-top: 10px; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px;">
      <div class="im2-scenario-row" style="display:flex; align-items:center; margin-bottom: 6px;">
        <span class="im2-scenario-name" style="width: 70px; font-size: 12px; color: #e7e9ea;">Swarm YES</span>
        <div class="im2-bar-track" style="flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin: 0 10px;">
          <div class="im2-bar-fill" style="height:100%; border-radius:3px; background:#00ba7c; width:${sim.simulatedYesPct}%"></div>
        </div>
        <span class="im2-scenario-pct" style="font-size: 12px; color: #00ba7c; font-weight:bold;">${sim.simulatedYesPct}%</span>
      </div>
      <div class="im2-scenario-row" style="display:flex; align-items:center;">
        <span class="im2-scenario-name" style="width: 70px; font-size: 12px; color: #e7e9ea;">Swarm NO</span>
        <div class="im2-bar-track" style="flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin: 0 10px;">
          <div class="im2-bar-fill" style="height:100%; border-radius:3px; background:#f91880; width:${sim.simulatedNoPct}%"></div>
        </div>
        <span class="im2-scenario-pct" style="font-size: 12px; color: #f91880; font-weight:bold;">${sim.simulatedNoPct}%</span>
      </div>
    </div>

    <div class="im2-section-label" style="margin-top:15px; font-weight:bold; color:#8899a6; font-size:11px; letter-spacing:0.5px;">TOP AGENT REASONING</div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
      ${sim.decisions.slice(0, 3).map(agent => `
        <div class="im2-source-card" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; font-size: 12px; color: #e7e9ea;">
          <div class="im2-source-header" style="display:flex; justify-content:space-between; margin-bottom: 4px;">
            <span class="im2-source-platform" style="font-weight:bold;">${escapeHtml(agent.name)}</span>
            <span class="im2-rel-score" style="color: ${agent.decision === 'YES' ? '#00ba7c' : '#f91880'}; font-weight:bold;">${agent.decision} - ${agent.confidence}%</span>
          </div>
          <div class="im2-source-snippet" style="opacity: 0.8; line-height: 1.4;">"${escapeHtml(agent.reasoning)}"</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// EXPORTS — allow inject.js to trigger the resolution engine
// ============================================================
window.setMarketResearch = setMarketResearch;
window.rerenderPortfolioTabIfVisible = rerenderPortfolioTabIfVisible;
window.switchSidebarToPortfolio = switchSidebarToPortfolio;
window.switchSidebarToMarkets = switchSidebarToMarkets;
window.setSidebarActiveMarketFromViewport = setSidebarActiveMarketFromViewport;
window.switchSidebarToSaved = switchSidebarToSaved;
window.saveMarketForLater = saveMarketForLater;
window.recordSidebarBet = recordSidebarBet;
window.executeResolutionTrade = executeResolutionTrade;
window.showResolutionReceiptCard = showResolutionReceiptCard;
window.createFloatingPnL = createFloatingPnL;
window.showToast = showToast;
