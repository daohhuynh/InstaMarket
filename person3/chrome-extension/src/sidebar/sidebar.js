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
let IM_STORAGE_SYNC_INITIALIZED = false;
let IM_STORAGE_CHANGE_LISTENER_BOUND = false;
const IM_STORAGE_MEMORY = Object.create(null);

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
      <button class="im-tab" data-tab="saved"><span>Saved</span></button>
    </div>

    <div class="im-tab-content active" id="im-tab-portfolio">
      ${renderPortfolioTab()}
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
      'Place your first YES/NO bet from a tweet card and your activity will appear here.'
    );
  }

  const yesCount = betLog.filter(entry => entry.side === 'YES').length;
  const noCount = betLog.filter(entry => entry.side === 'NO').length;
  const uniqueMarkets = new Set(betLog.map(entry => entry.marketId)).size;
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
    ${recent.map(renderBetRow).join('')}
  `;
}

function renderBetRow(entry) {
  const positiveSide = entry.side === 'YES';
  const postUrl = sanitizePostUrl(entry?.postUrl || '');
  const normalizedAmount =
    Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
      ? Math.round(Number(entry.amount))
      : 0;
  const clickableAttrs = postUrl
    ? ` data-im-action="open-bet-post" data-post-url="${escapeHtml(postUrl)}" title="Open source post on X" role="button" tabindex="0"`
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
  const research = getMarketResearch(primary.id);

  return `
    ${renderMarketCard(primary, true)}

    <div class="im-section-header">Related Markets</div>
    ${related.length ? related.map(market => renderMarketCard(market, false)).join('') : renderEmptyPanel('No related markets', 'No nearby related market found for this topic.')}

    <div class="im-section-header">Research</div>
    ${research ? renderResearchCard(research) : renderResearchPlaceholder(primary)}

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

  if (Array.isArray(primary.relatedMarkets) && primary.relatedMarkets.length > 0) {
    const byId = new Map(markets.map(market => [String(market.id), market]));
    return primary.relatedMarkets
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .slice(0, 4);
  }

  const sameCategory = markets.filter(market =>
    market.id !== primary.id && market.category && primary.category && market.category === primary.category
  );
  if (sameCategory.length > 0) {
    return sameCategory.slice(0, 4);
  }

  const lexical = markets
    .filter(market => market.id !== primary.id)
    .map(market => ({ market, score: lexicalOverlap(primary.question, market.question) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(item => item.market);

  return lexical;
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
  return `
    <div class="im-risk-panel">
      <div class="im-market-title">${escapeHtml(research.title || 'Running thesis engine...')}</div>
      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        ${escapeHtml(research.summary || 'Collecting evidence and analyst views...')}
      </div>
      <div class="im-thesis-loading-bar">
        <div class="im-thesis-loading-fill"></div>
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
  const fullDataVisible = Boolean(research.showFullData);
  const catalysts = Array.isArray(thesis.catalysts) ? thesis.catalysts : [];
  const invalidation = Array.isArray(thesis.invalidation) ? thesis.invalidation : [];
  const riskFlags = Array.isArray(thesis.risk_flags) ? thesis.risk_flags : [];
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

  return `
    <div class="im-risk-panel">
      <div class="im-thesis-header">
        <div class="im-market-title">${escapeHtml(research.title || 'AI Thesis')}</div>
        <div class="im-thesis-chip">${confidence}% confidence</div>
      </div>

      <div class="im-thesis-metrics">
        <div class="im-thesis-metric">
          <div class="im-thesis-metric-label">Fair Probability</div>
          <div class="im-thesis-metric-value">${fairProbability.toFixed(1)}%</div>
        </div>
        <div class="im-thesis-metric">
          <div class="im-thesis-metric-label">Suggested Action</div>
          <div class="im-thesis-metric-value ${suggestedAction === 'YES' ? 'yes' : suggestedAction === 'NO' ? 'no' : ''}">${escapeHtml(suggestedAction)}</div>
        </div>
        <div class="im-thesis-metric">
          <div class="im-thesis-metric-label">Suggested Size</div>
          <div class="im-thesis-metric-value">$${suggestedAmount.toFixed(2)}</div>
        </div>
      </div>

      <div style="font-size:12px;color:var(--pm-text-secondary);line-height:1.5;">
        ${escapeHtml(thesis.explanation || research.summary || 'No thesis explanation provided.')}
      </div>

      <div class="im-thesis-actions-row">
        <button class="im-btn-secondary" data-im-action="toggle-full-research" data-market-id="${escapeHtml(marketId)}">
          ${fullDataVisible ? 'Hide Full Research' : 'View Full Research'}
        </button>
        <button class="im-btn-secondary" data-im-action="download-research-pdf" data-market-id="${escapeHtml(marketId)}">
          Download PDF
        </button>
      </div>

      ${catalysts.length ? `
        <div>
          <div class="im-thesis-section-title">Catalysts</div>
          <ul class="im-thesis-list">${catalysts.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${invalidation.length ? `
        <div>
          <div class="im-thesis-section-title">Invalidation</div>
          <ul class="im-thesis-list">${invalidation.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${riskFlags.length ? `
        <div>
          <div class="im-thesis-section-title">Risk Flags</div>
          <div class="im-thesis-risk-flags">
            ${riskFlags.map(flag => `<span class="im-thesis-risk-flag">${escapeHtml(flag)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="im-thesis-trade-panel" data-market-id="${escapeHtml(marketId)}">
        <div class="im-thesis-section-title">Execute Bet (Manual Override)</div>
        <div class="im-thesis-exec-grid">
          <label class="im-thesis-field">
            <span>Side</span>
            <select class="im-thesis-select" data-im-field="trade-side">
              <option value="YES" ${defaultTradeSide === 'YES' ? 'selected' : ''}>YES</option>
              <option value="NO" ${defaultTradeSide === 'NO' ? 'selected' : ''}>NO</option>
            </select>
          </label>
          <label class="im-thesis-field">
            <span>Amount (USDC)</span>
            <input class="im-thesis-input" data-im-field="trade-amount" type="number" min="1" step="0.01" value="${Math.max(1, suggestedAmount || 1).toFixed(2)}" />
          </label>
        </div>
        <div class="im-thesis-stop-loss">Suggested stop loss: ${maxStopLoss}c</div>
        <button class="im-btn-primary" data-im-action="research-place-bet" data-market-id="${escapeHtml(marketId)}">
          Place Bet
        </button>
        ${market?.polymarketUrl ? `<a class="im-thesis-open-link" href="${escapeHtml(market.polymarketUrl)}" target="_blank" rel="noopener noreferrer">Open market on Polymarket</a>` : ''}
      </div>

      ${fullDataVisible ? renderFullResearchData({
        thesis,
        market,
        reportId: dossier.report_id || '',
        isFallback: Boolean(dossier.is_fallback),
        briefingLines,
        sourceCounts: dossier.source_counts || {},
        allSources: effectiveSources,
        collectionErrors: Array.isArray(dossier.collection_errors) ? dossier.collection_errors : []
      }) : ''}
    </div>
  `;
}

function renderFullResearchData(data) {
  const thesis = data?.thesis || {};
  const market = data?.market || null;
  const allSources = Array.isArray(data?.allSources) ? data.allSources : [];
  const sourceCounts = normalizeSourceCounts(data?.sourceCounts || {}, allSources);
  const briefingLines = Array.isArray(data?.briefingLines) ? data.briefingLines : [];
  const collectionErrors = Array.isArray(data?.collectionErrors) ? data.collectionErrors : [];
  const isFallback = Boolean(data?.isFallback);

  return `
    <div class="im-full-research-panel">
      <div class="im-thesis-section-title">Full Research Data</div>
      <div class="im-full-research-meta">Report ID: ${escapeHtml(data?.reportId || 'n/a')}</div>
      ${isFallback ? `<div class="im-full-research-warning">Fallback mode: scraper pipeline failed, so this report is degraded.</div>` : ''}
      ${renderExecutiveBrief({ thesis, market, sourceCounts, allSources })}
      ${renderAgentInteractionGraph(thesis)}
      <div class="im-full-research-meta">
        Counts: x=${Number(sourceCounts.x ?? 0)}, youtube=${Number(sourceCounts.youtube ?? 0)}, reddit=${Number(sourceCounts.reddit ?? 0)}, news=${Number(sourceCounts.news ?? 0)}, google=${Number(sourceCounts.google ?? 0)}, tiktok=${Number(sourceCounts.tiktok ?? 0)}
      </div>
      ${collectionErrors.length ? `
        <div>
          <div class="im-thesis-section-title">Collection Errors</div>
          <ul class="im-thesis-list">${collectionErrors.map(item => `<li>${escapeHtml(String(item.source_type || 'unknown'))}: ${escapeHtml(String(item.error || 'Unknown error'))}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${briefingLines.length ? `
        <div>
          <div class="im-thesis-section-title">Briefing</div>
          <ul class="im-thesis-list">${briefingLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      <div class="im-thesis-section-title">Sources (${allSources.length})</div>
      <div class="im-full-research-sources">
        ${allSources.length ? allSources.map(source => `
          <div class="im-full-research-source">
            <div class="im-full-research-source-top">
              <span class="im-full-research-type">${escapeHtml(String(source.source_type || '').toUpperCase())}</span>
              <span class="im-full-research-score">Rel ${(Number(source.relevance_score) || 0).toFixed(2)}</span>
            </div>
            <div class="im-full-research-title">${escapeHtml(source.title || 'Untitled source')}</div>
            <a class="im-thesis-open-link" href="${escapeHtml(source.url || '#')}" target="_blank" rel="noopener noreferrer">Open source</a>
            <div class="im-full-research-snippet">${escapeHtml(source.snippet || source.raw_text || '')}</div>
          </div>
        `).join('') : '<div class="im-full-research-meta">No sources available.</div>'}
      </div>
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

function renderExecutiveBrief({ thesis, market, sourceCounts, allSources }) {
  const fairProb = Number.isFinite(Number(thesis.fair_probability)) ? Number(thesis.fair_probability) : 50;
  const confidence = Number.isFinite(Number(thesis.confidence)) ? Number(thesis.confidence) : 50;
  const suggestedAction = thesis.suggested_action === 'YES' || thesis.suggested_action === 'NO' || thesis.suggested_action === 'SKIP'
    ? thesis.suggested_action
    : 'SKIP';
  const suggestedAmount = Number.isFinite(Number(thesis.suggested_amount_usdc)) ? Number(thesis.suggested_amount_usdc) : 0;
  const stopLossCents = Number.isFinite(Number(thesis.stop_loss_cents)) ? Number(thesis.stop_loss_cents) : 15;
  const yesOdds = Number.isFinite(Number(market?.yesOdds)) ? Number(market.yesOdds) : null;
  const marketImplied = yesOdds !== null ? yesOdds : 50;
  const edge = fairProb - marketImplied;
  const edgeDirection = edge >= 0 ? 'Long YES bias' : 'Long NO bias';
  const conviction = confidence >= 75 ? 'High' : confidence >= 60 ? 'Medium' : 'Low';
  const sourceCoverage =
    Number(sourceCounts.x ?? 0) +
    Number(sourceCounts.youtube ?? 0) +
    Number(sourceCounts.reddit ?? 0) +
    Number(sourceCounts.news ?? 0) +
    Number(sourceCounts.google ?? 0) +
    Number(sourceCounts.tiktok ?? 0);
  const evidenceQuality = sourceCoverage >= 15 ? 'Strong' : sourceCoverage >= 8 ? 'Moderate' : 'Thin';
  const baseCase = fairProb;
  const bullCase = Math.min(99, fairProb + Math.max(3, (100 - confidence) * 0.25));
  const bearCase = Math.max(1, fairProb - Math.max(3, (100 - confidence) * 0.25));

  return `
    <div>
      <div class="im-thesis-section-title">Executive Brief</div>
      <div class="im-full-research-meta">
        View: <strong>${escapeHtml(edgeDirection)}</strong> | Conviction: <strong>${escapeHtml(conviction)}</strong> | Evidence: <strong>${escapeHtml(evidenceQuality)}</strong>
      </div>
      <div class="im-full-research-meta">
        Base/Bull/Bear fair prob: <strong>${baseCase.toFixed(1)}%</strong> / <strong>${bullCase.toFixed(1)}%</strong> / <strong>${bearCase.toFixed(1)}%</strong>
      </div>
      <div class="im-full-research-meta">
        Position plan: side <strong>${escapeHtml(suggestedAction)}</strong>, size <strong>$${suggestedAmount.toFixed(2)}</strong>, stop <strong>${stopLossCents}c</strong>, edge vs market <strong>${edge >= 0 ? '+' : ''}${edge.toFixed(1)} pts</strong>.
      </div>
      <div class="im-full-research-meta">
        ${escapeHtml(thesis.explanation || 'No thesis narrative available.')}
      </div>
      ${Array.isArray(thesis.risk_flags) && thesis.risk_flags.length ? `
        <div>
          <div class="im-thesis-section-title">Risk Monitor</div>
          <ul class="im-thesis-list">${thesis.risk_flags.map(flag => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${allSources.length ? `
        <div class="im-full-research-meta">Top evidence: ${escapeHtml(allSources[0]?.title || 'n/a')}</div>
      ` : ''}
    </div>
  `;
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
    : '';

  return `
    <div class="im-market-card ${isBest ? 'best-match' : ''}">
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
      'Use the Save button on tweet cards or market cards to track markets over time.'
    );
  }

  return saved.map(item => {
    const currentYes = Number.isFinite(item.currentYesOdds) ? item.currentYesOdds : item.savedYesOdds;
    const currentNo = Number.isFinite(item.currentNoOdds) ? item.currentNoOdds : item.savedNoOdds;
    const postUrl = sanitizePostUrl(item?.postUrl || '');
    const rowActionAttrs = postUrl
      ? ` data-im-action="open-saved-post" data-post-url="${escapeHtml(postUrl)}" title="Open saved source post on X" role="button" tabindex="0"`
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

    if (action === 'bet' && marketId && side) {
      const recorded = recordSidebarBet(marketId, side);
      if (recorded) {
        showToast(`Bet placed: ${side}`);
        rerenderPortfolioTabIfVisible();
      }
      return;
    }

    if (action === 'refresh-live-markets') {
      if (typeof loadPolymarketMarketUniverse !== 'function') {
        showToast('Live market loader unavailable.');
        return;
      }
      try {
        await loadPolymarketMarketUniverse({ limit: 2200, pageSize: 500, maxPages: 6 });
        showToast('Live markets refreshed.');
        rerenderPortfolioTabIfVisible();
        rerenderSavedTabIfVisible();
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

    if (action === 'research-place-bet' && marketId) {
      const panel = target.closest('.im-thesis-trade-panel');
      if (!panel) {
        showToast('Trade controls not found.');
        return;
      }

      const amountInput = panel.querySelector('[data-im-field="trade-amount"]');
      const sideInput = panel.querySelector('[data-im-field="trade-side"]');
      const amount = Number(amountInput?.value || 0);
      const side = sideInput?.value === 'NO' ? 'NO' : 'YES';
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Enter a valid USDC amount.');
        return;
      }

      const market = typeof getMarketById === 'function' ? getMarketById(marketId) : null;
      if (!market) {
        showToast('Market not found.');
        return;
      }

      const yesPricePct = Number(market.yesOdds) || 50;
      const noPricePct = Number(market.noOdds) || 50;
      const pricePct = side === 'YES' ? yesPricePct : noPricePct;
      const shares = Math.max(1, amount / Math.max(pricePct / 100, 0.01));

      const walletAddress = getWalletAddress();
      const payload = {
        walletAddress,
        marketId: String(market.id),
        side,
        shares: Number(shares.toFixed(4)),
        price: Number(pricePct.toFixed(2))
      };

      try {
        await submitBetToBridge(payload);
        const recorded = recordSidebarBet(marketId, side, amount);
        if (recorded) rerenderPortfolioTabIfVisible();
        showToast(`Executed ${side} bet for $${amount.toFixed(2)}`);
      } catch {
        showToast('Bet API failed.');
      }
      return;
    }
  });

  sidebar.addEventListener('keydown', event => {
    const target = event.target?.closest?.('[data-im-action="open-bet-post"], [data-im-action="open-saved-post"]');
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
      } else if (tabName === 'saved') {
        content.innerHTML = renderSavedTab();
      }

      content.classList.add('active');
    });
  });
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
  if (typeof fetchJsonWithExtensionSupport === 'function') {
    const response = await fetchJsonWithExtensionSupport(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 12000
    });
    if (!response || response.error) {
      throw new Error(response?.error || 'Bet request failed');
    }
    return response;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Bet request failed (${response.status})`);
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
    const briefing = Array.isArray(dossier.briefing_lines) ? dossier.briefing_lines : [];
    const collectionErrors = Array.isArray(dossier.collection_errors) ? dossier.collection_errors : [];
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

function switchSidebarToMarkets(marketId) {
  const sidebar = document.getElementById('im-sidebar');
  if (!sidebar) {
    createSidebar();
  }

  IM_ACTIVE_MARKET_ID = marketId || IM_ACTIVE_MARKET_ID;

  document.querySelectorAll('.im-tab').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.im-tab-content').forEach(item => item.classList.remove('active'));

  // Markets tab has been removed; route to Portfolio to keep existing
  // tweet-card navigation actions stable.
  const portfolioTab = document.querySelector('.im-tab[data-tab="portfolio"]');
  const portfolioContent = document.getElementById('im-tab-portfolio');

  if (portfolioTab) {
    portfolioTab.classList.add('active');
  }

  if (portfolioContent) {
    portfolioContent.classList.add('active');
    portfolioContent.innerHTML = renderPortfolioTab();
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

window.setMarketResearch = setMarketResearch;
window.switchSidebarToMarkets = switchSidebarToMarkets;
window.switchSidebarToSaved = switchSidebarToSaved;
window.saveMarketForLater = saveMarketForLater;
window.recordSidebarBet = recordSidebarBet;
