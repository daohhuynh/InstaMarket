// ============================================================
// INJECT.JS — entry point, injects tweet layers + sidebar
// ============================================================

(function () {
  'use strict';

  let sidebarMounted = false;
  let tweetObserverStarted = false;
  let routeHooksInstalled = false;
  let initialScanIntervalId = null;
  let lastKnownUrl = '';
  let marketUniverseHydrated = false;

  // ── Wait for DOM ready ──────────────────────────────────
  function init() {
    mountSidebar();
    mountDittoButton();
    observeTweets();
    primeInitialTweetScan();
    installRouteHooks();
    hydrateMarketUniverse()
      .then(isHydrated => {
        marketUniverseHydrated = Boolean(isHydrated);
        kickPostHydrationRescan();
      })
      .catch(error => {
        console.warn('[InstaMarket] Initial market hydration failed:', error);
      });
  }

  // ── Sidebar ─────────────────────────────────────────────
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
    btn.innerHTML = '❯';
    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('im-sidebar');
    const toggle = document.getElementById('im-sidebar-toggle');
    const main = document.querySelector('main[role="main"]');
    const collapsed = sidebar.classList.toggle('im-collapsed');
    toggle.classList.toggle('im-collapsed', collapsed);
    toggle.innerHTML = collapsed ? '❮' : '❯';
    if (main) main.classList.toggle('im-sidebar-hidden', collapsed);
  }

  // ── Ditto floating button ───────────────────────────────
  function mountDittoButton() {
    if (document.getElementById('im-ditto-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'im-ditto-btn';
    btn.title = 'Ditto — Find your trading tribe';
    // Real Ditto sprite from PokeAPI (official Nintendo/Game Freak sprites, open use)
    btn.innerHTML = `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" alt="Ditto" style="width:34px;height:34px;image-rendering:pixelated;filter:drop-shadow(0 0 6px rgba(167,139,250,0.8));">`;
    btn.addEventListener('click', toggleDittoModal);
    document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'im-ditto-modal';
    modal.innerHTML = renderDittoModal();
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.im-ditto-close');
    closeBtn?.addEventListener('click', () => {
      modal.classList.remove('open');
    });
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
  function scanTweetsForInjection() {
    document.querySelectorAll('article[data-testid="tweet"]:not([data-im-processing]):not([data-im-injected="true"])').forEach(tweet => {
      injectTweetLayer(tweet).catch(error => console.warn('[InstaMarket] Tweet injection error:', error));
    });
  }

  function observeTweets() {
    if (tweetObserverStarted) return;
    tweetObserverStarted = true;

    const observer = new MutationObserver(() => {
      scanTweetsForInjection();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanTweetsForInjection();
  }

  function primeInitialTweetScan() {
    if (initialScanIntervalId) {
      clearInterval(initialScanIntervalId);
      initialScanIntervalId = null;
    }

    let attempts = 0;
    const maxAttempts = 120; // ~36s at 300ms
    scanTweetsForInjection();

    initialScanIntervalId = setInterval(() => {
      attempts += 1;
      scanTweetsForInjection();
      if (attempts >= maxAttempts) {
        clearInterval(initialScanIntervalId);
        initialScanIntervalId = null;
      }
    }, 300);
  }

  function clearNoMatchMarkers() {
    document.querySelectorAll('article[data-testid="tweet"][data-im-injected="nomatch"]').forEach(tweet => {
      tweet.removeAttribute('data-im-injected');
    });
  }

  function kickPostHydrationRescan() {
    clearNoMatchMarkers();
    scanTweetsForInjection();
    setTimeout(scanTweetsForInjection, 800);
    setTimeout(scanTweetsForInjection, 2500);
  }

  function installRouteHooks() {
    if (routeHooksInstalled) return;
    routeHooksInstalled = true;
    lastKnownUrl = window.location.href;

    const handleRouteChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl === lastKnownUrl) return;
      lastKnownUrl = currentUrl;

      scanTweetsForInjection();
      primeInitialTweetScan();
      hydrateMarketUniverse()
        .then(isHydrated => {
          marketUniverseHydrated = marketUniverseHydrated || Boolean(isHydrated);
          if (isHydrated) {
            kickPostHydrationRescan();
          }
        })
        .catch(() => {
          // Ignore route hydration failures, existing data is still usable.
        });
    };

    const originalPushState = history.pushState;
    history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(handleRouteChange, 0);
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(handleRouteChange, 0);
      return result;
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('focus', scanTweetsForInjection);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        scanTweetsForInjection();
      }
    });
  }

  function isLikelyPromotedTweet(tweet) {
    if (!tweet) return false;

    if (tweet.querySelector('[aria-label="Promoted"], [aria-label="Ad"], [data-testid="placementTracking"]')) {
      return true;
    }

    const spanTexts = [...tweet.querySelectorAll('span')]
      .slice(0, 140)
      .map(node => String(node.textContent || '').trim().toLowerCase())
      .filter(Boolean);

    if (spanTexts.includes('ad') || spanTexts.includes('promoted')) {
      return true;
    }

    const firstLines = String(tweet.innerText || '')
      .split('\n')
      .slice(0, 12)
      .map(line => line.trim().toLowerCase())
      .filter(Boolean);

    if (firstLines.includes('ad') || firstLines.includes('promoted')) {
      return true;
    }

    const compactHeader = firstLines.slice(0, 4).join(' ');
    if (/\bpromoted\b/.test(compactHeader)) {
      return true;
    }

    return /^ad\b/.test(compactHeader);
  }

  function extractPrimaryTweetText(tweet) {
    if (!tweet) return '';

    const cloned = tweet.cloneNode(true);

    // Remove nested quoted tweets; keep only the outer tweet text context.
    cloned.querySelectorAll('article[data-testid="tweet"]').forEach(node => {
      node.remove();
    });

    // Remove rich card text and promoted/ad badges that pollute matching.
    cloned.querySelectorAll('[data-testid="card.wrapper"], [aria-label="Ad"], [aria-label="Promoted"]').forEach(node => {
      node.remove();
    });

    const tweetTextNodes = [...cloned.querySelectorAll('[data-testid="tweetText"]')];
    const primary = tweetTextNodes[0];
    if (primary && typeof primary.innerText === 'string') {
      return sanitizeText(primary.innerText);
    }

    const fallback = sanitizeText(cloned.innerText || '');
    return fallback;
  }

  function sanitizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function injectTweetLayer(tweet) {
    if (!tweet || tweet.getAttribute('data-im-processing') === 'true') {
      return;
    }
    tweet.setAttribute('data-im-processing', 'true');

    try {
      if (isLikelyPromotedTweet(tweet)) {
        tweet.setAttribute('data-im-injected', 'true');
        return;
      }

      const tweetText = extractPrimaryTweetText(tweet);
      if (!tweetText || tweetText.length < 10) {
        tweet.setAttribute('data-im-injected', 'true');
        return;
      }
      const match = await findBestMarketForTweetWithAi(tweetText);
      if (!match) {
        tweet.setAttribute('data-im-injected', 'nomatch');
        setTimeout(() => {
          if (tweet.getAttribute('data-im-injected') === 'nomatch') {
            tweet.removeAttribute('data-im-injected');
          }
        }, marketUniverseHydrated ? 12000 : 2500);
        return;
      }
      const market = match.market;
      const researchSummary = buildResearchSummary(tweetText, match);
      persistResearch(market.id, researchSummary);
      const safeQuestion = escapeHtml(market.question);
      const safeVolume = escapeHtml(market.volume || '$0 Vol');
      const safeMarketId = escapeHtml(String(market.id));
      const safeMarketUrl = escapeHtml(market.polymarketUrl || '');

      const layer = document.createElement('div');
      layer.className = 'im-tweet-layer';
      layer.innerHTML = `
        <div class="im-market-question">
          Market: <span>${safeQuestion}</span>
          <span class="im-match-confidence">· ${match.confidence}% ${match.source === 'aws-bedrock' ? 'AI' : 'parser'} match</span>
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
      layer.querySelectorAll('.im-bet-yes, .im-bet-no').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const side = btn.dataset.side;
          const mId = btn.dataset.market;
          showToast(`Bet placed: ${side} on "${market.question.slice(0, 40)}…" ✓`);
          if (typeof window.recordSidebarBet === 'function') {
            window.recordSidebarBet(mId, side);
          }
          persistResearch(mId, researchSummary);
          switchSidebarToMarkets(mId);
        });
      });

      layer.querySelector('.im-save-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (typeof window.saveMarketForLater === 'function') {
          const saved = window.saveMarketForLater(market.id);
          showToast(saved ? `Saved: "${market.question.slice(0, 40)}…" ✓` : 'Already saved.');
          return;
        }
        showToast(`Saved: "${market.question.slice(0, 40)}…" ✓`);
      });

      layer.querySelector('.im-research-btn').addEventListener('click', e => {
        e.stopPropagation();
        persistResearch(market.id, researchSummary);
        showToast(`Research ready: "${market.question.slice(0, 40)}…"`);
        switchSidebarToMarkets(market.id);
      });

      const pmLink = layer.querySelector('.im-pm-link');
      pmLink?.addEventListener('click', e => {
        e.stopPropagation();
        const targetUrl = pmLink.getAttribute('data-market-url');
        if (targetUrl) {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      });

      // Insert after the tweet's action row
      const actionRow = tweet.querySelector('[role="group"]');
      if (actionRow && actionRow.parentNode) {
        actionRow.parentNode.insertBefore(layer, actionRow.nextSibling);
      } else {
        tweet.appendChild(layer);
      }
      tweet.setAttribute('data-im-injected', 'true');
    } finally {
      tweet.removeAttribute('data-im-processing');
    }
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

  async function hydrateMarketUniverse() {
    if (typeof loadPolymarketMarketUniverse !== 'function') {
      return false;
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
      return Boolean(result?.count);
    } catch (error) {
      console.warn('[InstaMarket] Unable to load live Polymarket markets:', error);
      return false;
    }
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        init();
      } catch (error) {
        console.error('[InstaMarket] Init failed:', error);
      }
    });
  } else {
    try {
      init();
    } catch (error) {
      console.error('[InstaMarket] Init failed:', error);
    }
  }

})();
