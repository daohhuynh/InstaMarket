// ============================================================
// INJECT.JS – entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  'use strict';

  const IM_SITE = detectSite();
  let sidebarMounted = false;
  let wapoArticleInjectionPromise = null;
  const IM_TRADE_AMOUNT_MIN = 1;
  const IM_TRADE_AMOUNT_MAX = 1000;
  const IM_TRADE_AMOUNT_DEFAULT = 250;
  const imTweetMarketMap = new Map();
  let imViewportSyncRaf = 0;
  let imLastViewportMarketId = '';

  // ── Wait for DOM ready ──────────────────────────────────────────
  async function init() {
    await hydrateMarketUniverse();

    if (IM_SITE === 'twitter') {
      mountSidebar('twitter');
      observeTweets();
      window.addEventListener('resize', syncAllTweetLayerAlignments);
      window.addEventListener('scroll', requestViewportMarketSync, { passive: true });
      window.addEventListener('resize', requestViewportMarketSync);
      return;
    }

    if (IM_SITE === 'wapo') {
      observeWashingtonPostArticle();
      window.addEventListener('resize', syncWashingtonPostInlineCardLayoutFromDom);
    }
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────────────────────
  function mountSidebar(site = IM_SITE) {
    if (sidebarMounted) return;
    sidebarMounted = true;
    document.documentElement.setAttribute('data-im-site', site);
    document.body?.setAttribute('data-im-site', site);
    createSidebar();
    const sidebar = document.getElementById('im-sidebar');
    if (sidebar) {
      sidebar.setAttribute('data-im-site', site);
    }
    mountCollapseToggle();

    // Site-specific page layout adjustments.
    const existingStyle = document.getElementById('im-site-layout-style');
    if (existingStyle) existingStyle.remove();
    const style = document.createElement('style');
    style.id = 'im-site-layout-style';
    style.textContent = `
      ${site === 'twitter' ? `
        @media (min-width: 1280px) {
          main[role="main"] { margin-right: 380px !important; transition: margin-right 0.3s ease; }
          main[role="main"].im-sidebar-hidden { margin-right: 0 !important; }
          [data-testid="sidebarColumn"] { display: none !important; }
        }
      ` : ''}
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
    document.documentElement.classList.toggle('im-sidebar-hidden', collapsed);
    document.body?.classList.toggle('im-sidebar-hidden', collapsed);
  }

  // ── Tweet observation ────────────────────────────────────────────────
  function observeTweets() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('article[data-testid="tweet"]:not([data-im-injected])').forEach(tweet => {
        injectTweetLayer(tweet).catch(error => console.warn('[InstaMarket] Tweet injection error:', error));
      });
      requestViewportMarketSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Also run immediately on existing tweets
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      injectTweetLayer(tweet).catch(error => console.warn('[InstaMarket] Tweet injection error:', error));
    });
    requestViewportMarketSync();
  }

  async function injectTweetLayer(tweet) {
    tweet.setAttribute('data-im-injected', 'true');

    const tweetText = tweet.innerText;
    const tweetContext = extractTweetContext(tweet);
    const match = await findBestMarketForTweetWithAi(tweetText);
    if (!match) return;
    const market = match.market;
    const marketId = String(market.id);
    const researchSummary = buildResearchSummary(tweetText, match);
    persistResearch(market.id, researchSummary);
    tweet.dataset.imMarketId = marketId;
    imTweetMarketMap.set(tweet, marketId);
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

    // Isolated Feed Gacha Engine (Mirrors 'Perfect' Sidebar visual logic)
    function triggerFeedBillboard(won, pnl) {
      const billboard = document.createElement('div');
      billboard.className = `im-gacha-billboard-feed ${won ? 'win' : 'lose'}`;
      const sign = Number(pnl) >= 0 ? '+' : '';
      billboard.textContent = `${sign}$${Math.abs(Number(pnl)).toFixed(2)}`;
      
      // Fixed at 25% from top to ensure it's always above the feed content
      billboard.style.cssText = `top: 25% !important;`;
      
      document.body.appendChild(billboard);
      setTimeout(() => billboard.remove(), 1200);
    }

    // Proxy function to get CLOB math from the bridge without relying on sidebar.js logic
    async function executeFeedResolution(buttonEl, payload) {
      const { amount, side } = payload;
      
      // Immediate Visuals (Original Toast)
      if (typeof window.showToast === 'function') {
        window.showToast(`Bet placed: $${amount} ${side} on market...`);
      }

      try {
        if (typeof fetchJsonWithExtensionSupport === 'function') {
          const response = await fetchJsonWithExtensionSupport('http://localhost:3000/api/bet', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const result = response?.json || response;
          if (result && result.resolutionReceipt) {
            const receipt = result.resolutionReceipt;
            triggerFeedBillboard(receipt.status === 'WINNER', receipt.pnl);
          } else {
            // Fallback Billboard on sync fail
            const won = Math.random() > 0.5;
            triggerFeedBillboard(won, won ? amount * 0.4 : -amount);
          }
        }
      } catch (err) {
        console.warn('[InstaMarket] Feed Resolution failed:', err);
        const won = Math.random() > 0.5;
        triggerFeedBillboard(won, won ? amount * 0.4 : -amount);
      }
    }

    // Bet buttons -> instant bet + show markets sidebar
    layer.querySelectorAll('[data-side][data-market]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const side = btn.dataset.side;
        const mId = btn.dataset.market;
        const amount = Number(getSelectedTradeAmount(layer)) || 10;
        
        // 1. Instant local update for Portfolio tab
        if (typeof window.recordSidebarBet === 'function') {
          window.recordSidebarBet(mId, side, amount, { postUrl: tweetContext?.postUrl || '' });
        }

        // 2. Trigger the Isolated Feed Gacha Simulation
        const yesPricePct = Number(market.yesOdds) || 50;
        const noPricePct = Number(market.noOdds) || 50;
        const pricePct = side === 'YES' ? yesPricePct : noPricePct;
        const shares = Math.max(1, amount / Math.max(pricePct / 100, 0.01));

        executeFeedResolution(btn, {
          walletAddress: (typeof getWalletAddress === 'function' ? getWalletAddress() : 'DEMO_WALLET'),
          marketId: String(mId),
          side,
          shares,
          price: pricePct,
          amount,
          question: market.question
        });

        if (typeof persistResearch === 'function') persistResearch(mId, researchSummary);
        if (typeof window.switchSidebarToMarkets === 'function') {
          window.switchSidebarToMarkets(mId);
        }
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
        focusSidebarOnPortfolioForResearch(market.id);
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
    requestViewportMarketSync();
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

  // ── Viewport market sync ─────────────────────────────────────────────
  function requestViewportMarketSync() {
    if (imViewportSyncRaf) return;
    imViewportSyncRaf = window.requestAnimationFrame(() => {
      imViewportSyncRaf = 0;
      syncSidebarToClosestTweetMarket();
    });
  }

  function syncSidebarToClosestTweetMarket() {
    if (typeof window.setSidebarActiveMarketFromViewport !== 'function') return;
    if (!imTweetMarketMap.size) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportHeight <= 0) return;
    const viewportCenterY = viewportHeight / 2;

    let bestMarketId = '';
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestVisibleRatio = -1;

    for (const [tweet, marketId] of imTweetMarketMap.entries()) {
      if (!tweet?.isConnected) {
        imTweetMarketMap.delete(tweet);
        continue;
      }

      const rect = tweet.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        continue;
      }

      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(centerY - viewportCenterY);

      if (
        distance < bestDistance - 0.5 ||
        (Math.abs(distance - bestDistance) <= 0.5 && visibleRatio > bestVisibleRatio)
      ) {
        bestDistance = distance;
        bestVisibleRatio = visibleRatio;
        bestMarketId = String(marketId || '').trim();
      }
    }

    if (!bestMarketId || bestMarketId === imLastViewportMarketId) {
      return;
    }

    imLastViewportMarketId = bestMarketId;
    window.setSidebarActiveMarketFromViewport(bestMarketId);
  }

  // ── Washington Post ──────────────────────────────────────────────────
  function observeWashingtonPostArticle() {
    const observer = new MutationObserver(() => {
      maybeInjectWashingtonPostArticle().catch(error => {
        console.warn('[InstaMarket] Washington Post injection error:', error);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    maybeInjectWashingtonPostArticle().catch(error => {
      console.warn('[InstaMarket] Washington Post injection error:', error);
    });
  }

  async function maybeInjectWashingtonPostArticle() {
    if (IM_SITE !== 'wapo') return;
    if (!isWashingtonPostArticlePage()) return;
    if (wapoArticleInjectionPromise) return wapoArticleInjectionPromise;

    const articleContext = extractWashingtonPostArticleContext();
    if (!articleContext?.articleRoot || !articleContext?.headline || !articleContext?.articleText) {
      return;
    }
    if (['pending', 'no-match', 'true'].includes(articleContext.articleRoot.dataset.imInjected || '')) {
      return;
    }

    wapoArticleInjectionPromise = injectWashingtonPostArticle(articleContext)
      .catch(error => {
        console.warn('[InstaMarket] Washington Post article injection failed:', error);
      })
      .finally(() => {
        wapoArticleInjectionPromise = null;
      });

    return wapoArticleInjectionPromise;
  }

  async function injectWashingtonPostArticle(articleContext) {
    const { articleRoot, articleText } = articleContext;
    articleRoot.dataset.imInjected = 'pending';
    try {
      const match = await findBestMarketForTweetWithAi(articleText);
      if (!match || !match.market) {
        articleRoot.dataset.imInjected = 'no-match';
        return;
      }

      const market = match.market;
      const researchSummary = buildResearchSummary(articleText, match);
      persistResearch(market.id, researchSummary);

      mountSidebar('wapo');
      document.getElementById('im-sidebar')?.classList.remove('im-collapsed');
      document.getElementById('im-sidebar-toggle')?.classList.remove('im-collapsed');
      document.body?.classList.remove('im-sidebar-hidden');
      document.documentElement.classList.remove('im-sidebar-hidden');
      mountWashingtonPostInlineCard({
        articleContext,
        market,
        researchSummary,
        articleText,
      });
      switchSidebarToMarkets(market.id);
      articleRoot.dataset.imInjected = 'true';
    } catch (error) {
      articleRoot.dataset.imInjected = 'error';
      throw error;
    }
  }

  function mountWashingtonPostInlineCard({ articleContext, market, researchSummary, articleText }) {
    if (!articleContext?.headerBlock || !market) return;
    if (document.getElementById('im-wapo-inline-card')) return;

    document.documentElement.setAttribute('data-im-site', 'wapo');
    document.body?.setAttribute('data-im-site', 'wapo');

    const safeMarketId = escapeHtml(String(market.id));
    const safeQuestion = escapeHtml(market.question || 'Matched market');
    const safeVolume = escapeHtml(market.volume || '$0 Vol');
    const safeMarketUrl = escapeHtml(market.polymarketUrl || '');

    const questionMarkup = safeMarketUrl
      ? `<a class="im-market-question-link" href="${safeMarketUrl}" target="_blank" rel="noopener noreferrer" title="Open on Polymarket">${safeQuestion}</a>`
      : safeQuestion;

    const card = document.createElement('aside');
    card.id = 'im-wapo-inline-card';
    card.className = 'im-wapo-inline-card';
    card.innerHTML = `
      <div class="im-wapo-inline-kicker">InstaMarket Signal</div>
      <div class="im-wapo-inline-shell">
        <div class="im-wapo-inline-meta">
          <span class="im-wapo-inline-label">Relevant Bet</span>
        </div>
        <div class="im-market-shell im-wapo-market-shell">
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
                <button class="im-research-btn im-wapo-research-btn" data-market="${safeMarketId}">
                  Research
                </button>
              </div>
              <button class="im-trade-choice im-trade-choice-no" data-market="${safeMarketId}" data-side="NO">
                Bet NO
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindTradeAmountControls(card);

    card.querySelectorAll('[data-side][data-market]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const side = button.dataset.side;
        const amount = getSelectedTradeAmount(card);
        showToast(`Bet placed: $${formatTradeAmount(amount)} ${side} on "${market.question.slice(0, 40)}..."`);
        if (typeof window.recordSidebarBet === 'function') {
          window.recordSidebarBet(String(market.id), side, amount, { postUrl: articleContext.postUrl || '' });
        }
        persistResearch(market.id, researchSummary);
        switchSidebarToMarkets(market.id);
      });
    });

    card.querySelector('.im-save-btn')?.addEventListener('click', event => {
      event.stopPropagation();
      if (typeof window.saveMarketForLater === 'function') {
        const saved = window.saveMarketForLater(market.id, { postUrl: articleContext.postUrl || '' });
        showToast(saved ? `Saved: "${market.question.slice(0, 40)}..."` : 'Already saved.');
        if (typeof window.switchSidebarToSaved === 'function') {
          window.switchSidebarToSaved();
        }
      }
    });

    const pmLink = card.querySelector('.im-pm-link');
    pmLink?.addEventListener('click', event => {
      event.stopPropagation();
      const targetUrl = pmLink.getAttribute('data-market-url');
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    });

    const questionLink = card.querySelector('.im-market-question-link');
    questionLink?.addEventListener('click', event => {
      event.stopPropagation();
    });

    card.querySelector('.im-wapo-research-btn')?.addEventListener('click', event => {
      event.stopPropagation();
      runLiveResearchForContext({
        market,
        contentText: articleText,
        context: articleContext,
        fallbackResearchSummary: researchSummary,
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

    articleContext.headerBlock.insertAdjacentElement('afterend', card);
    syncWashingtonPostInlineCardLayout(card, articleContext.headerBlock);
    window.requestAnimationFrame(() => syncWashingtonPostInlineCardLayout(card, articleContext.headerBlock));
    window.setTimeout(() => syncWashingtonPostInlineCardLayout(card, articleContext.headerBlock), 180);
  }

  function syncWashingtonPostInlineCardLayout(card, headerBlock) {
    if (!card || !headerBlock || !card.isConnected || !headerBlock.isConnected) return;

    const headerRect = headerBlock.getBoundingClientRect();
    if (!headerRect.width) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const leftInset = Math.max(0, Math.round(headerRect.left));
    const rightInset = Math.max(0, Math.round(viewportWidth - headerRect.right));

    card.style.maxWidth = `${Math.round(headerRect.width)}px`;
    card.style.width = `${Math.round(headerRect.width)}px`;
    card.style.marginLeft = `${leftInset}px`;
    card.style.marginRight = `${rightInset}px`;
  }

  function syncWashingtonPostInlineCardLayoutFromDom() {
    const card = document.getElementById('im-wapo-inline-card');
    const headerBlock = document.querySelector('[data-testid="article-topper"]');
    if (!card || !headerBlock) return;
    syncWashingtonPostInlineCardLayout(card, headerBlock);
  }

  // ── Shared UI helpers ────────────────────────────────────────────────
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

  function focusSidebarOnPortfolioForResearch(marketId) {
    if (typeof window.switchSidebarToPortfolio === 'function') {
      window.switchSidebarToPortfolio(marketId);
      return;
    }

    if (typeof switchSidebarToMarkets === 'function') {
      switchSidebarToMarkets(marketId);
    }
  }

  function formatProgressStep(event) {
    if (event.type === 'scraper_start') return event.message;
    if (event.type === 'scraper_source') return event.message;
    if (event.type === 'scraper_done') return event.message;
    if (event.type === 'agent_start') return event.message;
    if (event.type === 'agent_done') return null; // suppress — the _start already showed it
    return null;
  }

  // ── Research (tweets) ────────────────────────────────────────────────
  async function runLiveResearch({ market, tweet, tweetText, fallbackResearchSummary }) {
    const context = extractTweetContext(tweet);
    const completedSteps = [];
    let currentStep = 'Initialising research pipeline...';
    const MAX_LOADING_STEPS = 16;
    let loadingRenderRaf = 0;
    let loadingDirty = false;
    let loadingClosed = false;

    function stopLoadingUpdates() {
      loadingClosed = true;
      loadingDirty = false;
      if (loadingRenderRaf) {
        window.cancelAnimationFrame(loadingRenderRaf);
        loadingRenderRaf = 0;
      }
    }

    function flushLoadingState() {
      if (loadingClosed) return;
      persistResearch(market.id, {
        type: 'thesis',
        status: 'loading',
        title: `Researching "${market.question}"`,
        summary: currentStep,
        completedSteps: [...completedSteps],
        confidence: 0,
        matchedTerms: [],
        steps: []
      });
      if (typeof window.rerenderPortfolioTabIfVisible === 'function') {
        window.rerenderPortfolioTabIfVisible();
      }
    }

    function scheduleLoadingStateFlush() {
      if (loadingClosed) return;
      loadingDirty = true;
      if (loadingRenderRaf) return;
      loadingRenderRaf = window.requestAnimationFrame(() => {
        loadingRenderRaf = 0;
        if (!loadingDirty || loadingClosed) return;
        loadingDirty = false;
        flushLoadingState();
      });
    }

    function pushStep(label) {
      if (!label) return;
      const normalized = String(label).trim();
      if (!normalized) return;
      if (completedSteps[completedSteps.length - 1] === normalized) return;
      if (completedSteps.length >= MAX_LOADING_STEPS) {
        completedSteps.shift();
      }
      completedSteps.push(normalized);
      scheduleLoadingStateFlush();
    }

    try {
      persistResearch(market.id, {
        type: 'thesis',
        status: 'loading',
        title: `Researching "${market.question}"`,
        summary: currentStep,
        completedSteps: [],
        confidence: 0,
        matchedTerms: [],
        steps: []
      });
      focusSidebarOnPortfolioForResearch(market.id);

      if (typeof runResearchThesisForTweet !== 'function') {
        throw new Error('runResearchThesisForTweet helper unavailable');
      }

      const response = await runResearchThesisForTweet({
        tweetText,
        market,
        postUrl: context.postUrl,
        postAuthor: context.postAuthor,
        postTimestamp: context.postTimestamp,
        onProgress: (event) => {
          if (event.type === 'agent_start') {
            currentStep = event.message;
          }
          const label = formatProgressStep(event);
          if (label) pushStep(label);
        }
      });

      if (!response || typeof response !== 'object' || !response.thesis) {
        const errorMessage =
          typeof response?.error === 'string' && response.error
            ? response.error
            : 'No thesis payload from backend.';
        throw new Error(errorMessage);
      }
      let simData = null;
      try {
        if (typeof fetchJsonWithExtensionSupport === 'function') {
          simData = await fetchJsonWithExtensionSupport("http://localhost:3000/api/persona-sim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tweetText, market }),
            timeoutMs: 45000
          });
        } else {
          const simReq = await fetch("http://localhost:3000/api/persona-sim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tweetText, market })
          });
          if (simReq.ok) {
            simData = await simReq.json();
          }
        }
      } catch (err) {
        console.warn("[InstaMarket] Simulation fetch failed:", err);
      }

      // Fetch order book snapshot from CLOB (swarm always trades into market slot 1)
      // Wait briefly so all CLOB submissions have settled
      let orderBook = null;
      try {
        await new Promise(r => setTimeout(r, 1500));
        const obReq = await fetch("http://localhost:3000/api/orderbook/1");
        if (obReq.ok) {
          const obData = await obReq.json();
          if (Array.isArray(obData.yes) || Array.isArray(obData.no)) {
            orderBook = obData;
          }
        }
      } catch (err) {
        console.warn("[InstaMarket] Order book fetch failed (non-fatal):", err);
      }

      stopLoadingUpdates();
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
        simulation: simData,
        orderBook,
        showFullData: false
      });
      focusSidebarOnPortfolioForResearch(market.id);
    } finally {
      stopLoadingUpdates();
    }
  }

  // ── Research (WaPo / context-based) ─────────────────────────────────
  async function runLiveResearchForContext({ market, contentText, context, fallbackResearchSummary }) {
    const completedSteps = [];
    let currentStep = 'Initialising research pipeline...';

    function pushStep(label) {
      if (!label) return;
      completedSteps.push(label);
      persistResearch(market.id, {
        type: 'thesis',
        status: 'loading',
        title: `Researching "${market.question}"`,
        summary: currentStep,
        completedSteps: [...completedSteps],
        confidence: 0,
        matchedTerms: [],
        steps: []
      });
      if (typeof window.rerenderPortfolioTabIfVisible === 'function') {
        window.rerenderPortfolioTabIfVisible();
      }
    }

    persistResearch(market.id, {
      type: 'thesis',
      status: 'loading',
      title: `Researching "${market.question}"`,
      summary: currentStep,
      completedSteps: [],
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
      tweetText: contentText,
      market,
      postUrl: context?.postUrl,
      postAuthor: context?.postAuthor,
      postTimestamp: context?.postTimestamp,
      onProgress: (event) => {
        if (event.type === 'agent_start') {
          currentStep = event.message;
        }
        const label = formatProgressStep(event);
        if (label) pushStep(label);
      }
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
      showFullData: false
    });
    switchSidebarToMarkets(market.id);
    showToast(`Research ready: "${market.question.slice(0, 40)}…"`);
  }

  // ── Site detection + WaPo helpers ───────────────────────────────────
  function detectSite() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'twitter.com' || hostname === 'www.twitter.com' || hostname === 'x.com' || hostname === 'www.x.com') {
      return 'twitter';
    }
    if (hostname === 'washingtonpost.com' || hostname.endsWith('.washingtonpost.com')) {
      return 'wapo';
    }
    return 'unknown';
  }

  function isWashingtonPostArticlePage() {
    if (IM_SITE !== 'wapo') return false;
    const path = window.location.pathname || '';
    if (!path || path === '/' || path.split('/').filter(Boolean).length < 3) {
      return false;
    }
    const headline = document.querySelector('main h1, article h1, h1');
    const article = document.querySelector('article');
    return Boolean(headline && article);
  }

  function extractWashingtonPostArticleContext() {
    const articleRoot = document.querySelector('article');
    const headline = articleRoot?.querySelector('h1') || document.querySelector('main h1, h1');
    if (!articleRoot || !headline) return null;

    const headerBlock = findWashingtonPostHeaderBlock(headline, articleRoot);
    const paragraphs = Array.from(articleRoot.querySelectorAll('p'))
      .map(node => cleanArticleText(node.innerText))
      .filter(text => text && text.length > 35)
      .slice(0, 14);
    const dek = findWashingtonPostDek(articleRoot, headline);
    const articleText = [headline.innerText, dek, ...paragraphs].filter(Boolean).join('\n\n').trim();

    if (!articleText || articleText.length < 160) {
      return null;
    }

    return {
      articleRoot,
      headline,
      headerBlock,
      articleText,
      postUrl: window.location.href,
      postAuthor: extractWashingtonPostAuthor(articleRoot),
      postTimestamp: extractWashingtonPostTimestamp(articleRoot),
    };
  }

  function findWashingtonPostHeaderBlock(headline, articleRoot) {
    const explicitTopper =
      articleRoot?.querySelector('[data-testid="article-topper"]') ||
      document.querySelector('[data-testid="article-topper"]');
    if (explicitTopper) {
      return explicitTopper;
    }

    let node = headline?.parentElement || null;
    while (node && node !== articleRoot) {
      const text = cleanArticleText(node.innerText);
      if (text && text.length > 120) {
        return node;
      }
      node = node.parentElement;
    }
    return headline?.parentElement || headline;
  }

  function findWashingtonPostDek(articleRoot, headline) {
    const candidates = [
      headline?.nextElementSibling,
      articleRoot?.querySelector('h2'),
      articleRoot?.querySelector('p'),
    ];
    for (const candidate of candidates) {
      const text = cleanArticleText(candidate?.innerText || '');
      if (text && text.length > 40 && text !== cleanArticleText(headline?.innerText || '')) {
        return text;
      }
    }
    return '';
  }

  function extractWashingtonPostAuthor(articleRoot) {
    const authorCandidate = articleRoot?.querySelector('a[rel="author"], [data-cy*="author"] a, a[href*="/people/"], a[href*="/staff/"]');
    return cleanArticleText(authorCandidate?.innerText || '');
  }

  function extractWashingtonPostTimestamp(articleRoot) {
    const timeEl = articleRoot?.querySelector('time');
    return timeEl?.getAttribute('datetime') || cleanArticleText(timeEl?.innerText || '');
  }

  function cleanArticleText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

  // ── Boot ─────────────────────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(error => console.error('[InstaMarket] Init failed:', error));
    });
  } else {
    init().catch(error => console.error('[InstaMarket] Init failed:', error));
  }

})();
