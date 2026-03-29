// ============================================================
// INJECT.JS â€” entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  'use strict';

  let sidebarMounted = false;
  const IM_TRADE_AMOUNT_MIN = 1;
  const IM_TRADE_AMOUNT_MAX = 1000;
  const IM_TRADE_AMOUNT_DEFAULT = 250;

  // â”€â”€ Wait for DOM ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function init() {
    mountSidebar();
    mountDittoButton();
    await hydrateMarketUniverse();
    observeTweets();
    window.addEventListener('resize', syncAllTweetLayerAlignments);
  }

  // â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function mountSidebar() {
    if (sidebarMounted) return;
    sidebarMounted = true;
    createSidebar();
    mountCollapseToggle();

    // Hide Twitter's right sidebar column (we replace it), but don't touch their floating buttons
    const style = document.createElement('style');
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
    if (document.getElementById('im-sidebar-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'im-sidebar-toggle';
    btn.title = 'Collapse / expand InstaMarket sidebar';
    btn.setAttribute('aria-label', 'Collapse InstaMarket sidebar');
    btn.innerHTML = `
      <svg class="im-sidebar-toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M6 3L10 8L6 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('im-sidebar');
    const toggle = document.getElementById('im-sidebar-toggle');
    const main = document.querySelector('main[role="main"]');
    const collapsed = sidebar.classList.toggle('im-collapsed');
    toggle.classList.toggle('im-collapsed', collapsed);
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand InstaMarket sidebar' : 'Collapse InstaMarket sidebar'
    );
    if (main) main.classList.toggle('im-sidebar-hidden', collapsed);
    // Show Ditto only when sidebar is collapsed
    updateDittoVisibility();
  }

  function updateDittoVisibility() {
    const sidebar = document.getElementById('im-sidebar');
    const btn = document.getElementById('im-ditto-btn');
    if (!btn || !sidebar) return;
    const sidebarOpen = !sidebar.classList.contains('im-collapsed');
    btn.classList.toggle('im-hidden', sidebarOpen);
  }

  function watchSidebarForDitto() {
    const sidebar = document.getElementById('im-sidebar');
    if (!sidebar) return;
    new MutationObserver(() => updateDittoVisibility())
      .observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  }

  function alignDittoToTwitterButtons() {
    function attempt() {
      // Find Grok and Chat drawers by their exact testids from Twitter's DOM
      const grokEl = document.querySelector('[data-testid="GrokDrawer"]');
      const chatEl = document.querySelector('[data-testid="DMDrawer"]') ||
                     document.querySelector('[data-testid="FloatingActionButtons"] a[href*="messages"]')?.closest('[style]') ||
                     // fallback: find the fixed bottom-right button that is NOT the grok one
                     Array.from(document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]'))
                       .filter(el => {
                         if (el.contains(grokEl)) return false;
                         const r = el.getBoundingClientRect();
                         return r.right > window.innerWidth - 100 && r.bottom > window.innerHeight - 120 && r.width > 40 && r.width < 80;
                       })[0];

      if (!grokEl) return false;

      const grokRect = grokEl.getBoundingClientRect();
      const btn = document.getElementById('im-ditto-btn');
      if (!btn) return false;

      // Measure the gap between Grok top and Chat top (same gap goes above Grok for Ditto)
      let gap = 16; // sensible default
      if (chatEl) {
        const chatRect = chatEl.getBoundingClientRect();
        gap = Math.max(8, grokRect.top - chatRect.top - grokRect.height);
        // If that comes out weird, fall back to the visual spacing between the two buttons
        if (gap <= 0) gap = chatRect.top - grokRect.bottom;
        if (gap <= 0 || gap > 60) gap = 16;
      }

      // Use chat button for size + right alignment (it's the clean reference)
      const chatRect = chatEl ? chatEl.getBoundingClientRect() : null;
      const btnSize = chatRect ? Math.round(Math.min(chatRect.width, chatRect.height)) : 52;
      const rightFromViewport = chatRect
        ? Math.max(0, Math.round(window.innerWidth - chatRect.right) - 10)
        : 14;

      // Ditto bottom = distance from viewport bottom to TOP of GrokDrawer + same gap
      const grokRect2 = grokEl.getBoundingClientRect();
      const dittoBottom = Math.round(window.innerHeight - grokRect2.top + gap + 8);

      btn.style.right  = rightFromViewport + 'px';
      btn.style.bottom = dittoBottom + 'px';
      btn.style.width  = btnSize + 'px';
      btn.style.height = btnSize + 'px';

      const modal = document.getElementById('im-ditto-modal');
      if (modal) {
        modal.style.right  = rightFromViewport + 'px';
        modal.style.bottom = (dittoBottom + btnSize + 8) + 'px';
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

  // â”€â”€ Ditto floating button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function mountDittoButton() {
    if (document.getElementById('im-ditto-btn')) return;

    const DITTO_IMG = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png`;

    const btn = document.createElement('button');
    btn.id = 'im-ditto-btn';
    btn.title = 'Ditto â€” Find your trading tribe';
    // icon inner div mirrors Twitter's exact structure: absolute inset-0, size-9 (36px)
    btn.innerHTML = `
      <div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        <img src="${DITTO_IMG}" alt="Ditto" style="width:44px;height:44px;image-rendering:pixelated;">
      </div>`;
    btn.addEventListener('click', toggleDittoModal);
    document.body.appendChild(btn);

    // Snap Ditto's right/bottom to match Twitter's top floating button exactly
    alignDittoToTwitterButtons();

    const modal = document.createElement('div');
    modal.id = 'im-ditto-modal';
    modal.innerHTML = renderDittoModal();
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.im-ditto-close');
    closeBtn?.addEventListener('click', () => {
      modal.classList.remove('open');
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
      const btn = document.getElementById('im-ditto-btn');
      const modal = document.getElementById('im-ditto-modal');
      if (btn) btn.style.zIndex = twitterPanelOpen ? '1000' : '99999';
      if (modal) modal.style.zIndex = twitterPanelOpen ? '1001' : '100001';
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function toggleDittoModal() {
    const modal = document.getElementById('im-ditto-modal');
    if (!modal) return;
    modal.innerHTML = renderDittoModal();
    const closeBtn = modal.querySelector('.im-ditto-close');
    closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
    modal.classList.toggle('open');
  }

  function renderDittoModal() {
    const betLog = readJsonLocalStorage('instamarket_bet_log_v1');
    const uniqueMarkets = new Set(Array.isArray(betLog) ? betLog.map(entry => entry?.marketId).filter(Boolean) : []);
    const betCount = Array.isArray(betLog) ? betLog.length : 0;

    return `
      <div class="im-ditto-header">
        <div>
          <div class="im-ditto-title"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:20px;height:20px;vertical-align:middle;image-rendering:pixelated;margin-right:6px;">Ditto Matchmaking</div>
          <div class="im-ditto-sub">Live-only mode</div>
        </div>
        <button class="im-ditto-close">âœ•</button>
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

  // â”€â”€ Tweet observation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function observeTweets() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('article[data-testid="tweet"]:not([data-im-injected])').forEach(tweet => {
        injectTweetLayer(tweet).catch(error => console.warn('[InstaMarket] Tweet injection error:', error));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Also run immediately on existing tweets
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      injectTweetLayer(tweet).catch(error => console.warn('[InstaMarket] Tweet injection error:', error));
    });
  }

  async function injectTweetLayer(tweet) {
    tweet.setAttribute('data-im-injected', 'true');

    const tweetText = tweet.innerText;
    const tweetContext = extractTweetContext(tweet);
    const match = await findBestMarketForTweetWithAi(tweetText);
    if (!match) return;
    const market = match.market;
    const researchSummary = buildResearchSummary(tweetText, match);
    persistResearch(market.id, researchSummary);
    const safeQuestion = escapeHtml(market.question);
    const safeVolume = escapeHtml(market.volume || '$0 Vol');
    const safeMarketId = escapeHtml(String(market.id));
    const safeMarketUrl = escapeHtml(market.polymarketUrl || '');
    const questionMarkup = safeMarketUrl
      ? `<a class="im-market-question-link" href="${safeMarketUrl}" target="_blank" rel="noopener noreferrer" title="Open on Polymarket">${safeQuestion}</a>`
      : safeQuestion;

    const layer = document.createElement('div');
    layer.className = 'im-tweet-layer';
    layer.innerHTML = `
      <div class="im-market-shell">
        <div class="im-market-header">
          <span class="im-market-question">${questionMarkup}</span>
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
              <button class="im-research-btn" data-market="${safeMarketId}">
                Research
              </button>
            </div>
            <button class="im-trade-choice im-trade-choice-no" data-market="${safeMarketId}" data-side="NO">
              Bet NO
            </button>
          </div>
        </div>
      </div>
    `;

    bindTradeAmountControls(layer);

    // Bet buttons -> instant bet + show markets sidebar
    layer.querySelectorAll('[data-side][data-market]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const side = btn.dataset.side;
        const mId = btn.dataset.market;
        const amount = getSelectedTradeAmount(layer);
        showToast(`Bet placed: $${formatTradeAmount(amount)} ${side} on "${market.question.slice(0, 40)}..."`);
        if (typeof window.recordSidebarBet === 'function') {
          window.recordSidebarBet(mId, side, amount, { postUrl: tweetContext?.postUrl || '' });
        }
        persistResearch(mId, researchSummary);
        switchSidebarToMarkets(mId);
      });
    });

    layer.querySelector('.im-save-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (typeof window.saveMarketForLater === 'function') {
        const saved = window.saveMarketForLater(market.id, { postUrl: tweetContext?.postUrl || '' });
        showToast(saved ? `Saved: "${market.question.slice(0, 40)}..."` : 'Already saved.');
        if (typeof window.switchSidebarToSaved === 'function') {
          window.switchSidebarToSaved();
        }
        return;
      }
      showToast(`Saved: "${market.question.slice(0, 40)}..."`);
    });

    layer.querySelector('.im-research-btn').addEventListener('click', e => {
      e.stopPropagation();
      runLiveResearch({
        market,
        tweet,
        tweetText,
        fallbackResearchSummary: researchSummary
      }).catch((error) => {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Unknown thesis engine error.';
        persistResearch(market.id, {
          type: 'thesis',
          status: 'error',
          title: `Research failed for "${market.question}"`,
          summary: 'Research button only supports thesis-engine output. Parser fallback was skipped.',
          confidence: 0,
          method: 'Thesis engine error',
          matchedTerms: [],
          steps: [
            `Error: ${message}`,
            'Check that the research endpoint points to /v1/research-thesis on localhost:8787.',
            'Then rerun Research.',
          ]
        });
        showToast('Research failed. See sidebar details.');
        switchSidebarToMarkets(market.id);
      });
    });

    const pmLink = layer.querySelector('.im-pm-link');
    pmLink?.addEventListener('click', e => {
      e.stopPropagation();
      const targetUrl = pmLink.getAttribute('data-market-url');
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    });

    const questionLink = layer.querySelector('.im-market-question-link');
    questionLink?.addEventListener('click', e => {
      e.stopPropagation();
    });

    // Insert before the tweet action row so the card reads like part of the post.
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
    if (!layer || !tweet || !tweet.isConnected) return;

    const contentAnchor = findTweetContentAnchor(tweet);
    if (!contentAnchor) return;

    const layerRect = layer.getBoundingClientRect();
    const contentRect = contentAnchor.getBoundingClientRect();
    const offset = Math.round(contentRect.left - layerRect.left);

    if (Number.isFinite(offset) && offset >= 0) {
      layer.style.setProperty('--im-content-offset', `${Math.min(offset, 160)}px`);
    }
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function persistResearch(marketId, payload) {
    if (typeof setMarketResearch === 'function') {
      setMarketResearch(marketId, payload);
    }
  }

  async function runLiveResearch({ market, tweet, tweetText, fallbackResearchSummary }) {
    const context = extractTweetContext(tweet);
    persistResearch(market.id, {
      type: 'thesis',
      status: 'loading',
      title: `Running thesis engine for "${market.question}"...`,
      summary: 'Scraping X/YouTube/Reddit/News/Google and running Bedrock analysts.',
      confidence: 0,
      matchedTerms: [],
      steps: []
    });
    switchSidebarToMarkets(market.id);
    showToast('Running live research...');

    if (typeof runResearchThesisForTweet !== 'function') {
      throw new Error('runResearchThesisForTweet helper unavailable');
    }

    const response = await runResearchThesisForTweet({
      tweetText,
      market,
      postUrl: context.postUrl,
      postAuthor: context.postAuthor,
      postTimestamp: context.postTimestamp
    });

    if (!response || typeof response !== 'object' || !response.thesis) {
      const errorMessage =
        typeof response?.error === 'string' && response.error
          ? response.error
          : 'No thesis payload from backend.';
      throw new Error(errorMessage);
    }

    persistResearch(market.id, {
      type: 'thesis',
      status: 'ready',
      title: market.question,
      summary: response.thesis.explanation || fallbackResearchSummary.summary,
      confidence: Number(response.thesis.confidence) || 0,
      method: response.model_mode === 'bedrock' ? 'Bedrock Nova Lite thesis engine' : 'Heuristic thesis fallback',
      matchedTerms: [],
      steps: [
        `Report ID: ${response.dossier?.report_id || 'n/a'}`,
        `Sources: x=${response.dossier?.source_counts?.x ?? 0}, youtube=${response.dossier?.source_counts?.youtube ?? 0}, reddit=${response.dossier?.source_counts?.reddit ?? 0}, news=${response.dossier?.source_counts?.news ?? 0}, google=${response.dossier?.source_counts?.google ?? 0}, tiktok=${response.dossier?.source_counts?.tiktok ?? 0}`,
        ...(Array.isArray(response.dossier?.top_sources) ? response.dossier.top_sources.slice(0, 4).map(source => `${source.source_type.toUpperCase()}: ${source.title}`) : [])
      ],
      thesis: response.thesis,
      dossier: {
        report_id: response.dossier?.report_id || '',
        is_fallback: Boolean(response.dossier?.is_fallback),
        source_counts: response.dossier?.source_counts || {},
        briefing_lines: Array.isArray(response.dossier?.briefing_lines) ? response.dossier.briefing_lines : [],
        collection_errors: Array.isArray(response.dossier?.collection_errors) ? response.dossier.collection_errors : [],
        top_sources: Array.isArray(response.dossier?.top_sources) ? response.dossier.top_sources : [],
        all_sources: Array.isArray(response.dossier?.all_sources) ? response.dossier.all_sources : []
      },
      showFullData: true
    });
    switchSidebarToMarkets(market.id);
    showToast(`Research ready: "${market.question.slice(0, 40)}..."`);
  }

  function extractTweetContext(tweet) {
    const timeAnchor = tweet?.querySelector('time')?.closest('a');
    const authorAnchor = tweet?.querySelector('a[role="link"][href^="/"]');
    return {
      postUrl: normalizeToAbsoluteUrl(timeAnchor?.getAttribute('href') || ''),
      postAuthor: (authorAnchor?.getAttribute('href') || '').replaceAll('/', ''),
      postTimestamp: tweet?.querySelector('time')?.getAttribute('datetime') || ''
    };
  }

  function normalizeToAbsoluteUrl(value) {
    if (!value) return '';
    try {
      return new URL(value, window.location.origin).toString();
    } catch {
      return '';
    }
  }

  async function hydrateMarketUniverse() {
    if (typeof loadPolymarketMarketUniverse !== 'function') {
      return;
    }
    try {
      const result = await loadPolymarketMarketUniverse({ limit: 4500, pageSize: 500, maxPages: 10 });
      if (result?.count) {
        console.info(`[InstaMarket] Loaded ${result.count} live Polymarket markets.`);
      }

      // Expand to a much larger universe in the background for better long-tail matching.
      if (typeof warmExpandedMarketUniverse === 'function') {
        warmExpandedMarketUniverse({ limit: 9000, maxPages: 20 })
          .then(expanded => {
            if (expanded?.count) {
              console.info(`[InstaMarket] Expanded market universe to ${expanded.count} markets.`);
            }
          })
          .catch(() => {
            // Ignore expansion errors; base universe is already loaded.
          });
      }
    } catch (error) {
      console.warn('[InstaMarket] Unable to load live Polymarket markets:', error);
    }
  }

  // â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(error => console.error('[InstaMarket] Init failed:', error));
    });
  } else {
    init().catch(error => console.error('[InstaMarket] Init failed:', error));
  }

})();
