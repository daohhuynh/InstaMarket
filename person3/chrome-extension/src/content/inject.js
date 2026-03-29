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
    const authorText = [...tweet.querySelectorAll('[data-testid="User-Name"]')]
      .slice(0, 1)
      .map(node => sanitizeText(node.innerText || ''))
      .filter(Boolean);
    const outerText = [...tweet.querySelectorAll('[data-testid="tweetText"]')]
      .filter(node => !isNodeWithinNestedTweet(node, tweet))
      .map(node => sanitizeText(node.innerText || ''))
      .filter(Boolean);
    const quotedContextText = extractQuotedContextText(tweet);
    const cardText = collectCardPreviewText(tweet, { includeNested: true })
      .map(text => text.slice(0, 260));

    const merged = [];
    const seen = new Set();
    const pushUnique = (value) => {
      const compact = sanitizeText(value || '');
      if (!compact) return;
      if (seen.has(compact)) return;
      seen.add(compact);
      merged.push(compact);
    };

    authorText.forEach(pushUnique);
    // Prioritize quoted/card context first so critical entities (e.g. Claude in attached post)
    // are retained even if the outer tweet body is long.
    quotedContextText.slice(0, 2).forEach(pushUnique);
    cardText.slice(0, 2).forEach(pushUnique);
    outerText.slice(0, 2).forEach(pushUnique);

    return normalizeExtractedTweetText(merged.join(' ').slice(0, 1600));
  }

  function normalizeExtractedTweetText(value) {
    const compact = sanitizeText(value || '');
    if (!compact) return '';
    return sanitizeText(
      compact
        .replace(/\b\d+\s*(?:h|hr|hrs)\b/gi, ' ')
        .replace(/\bview post analytics\b/gi, ' ')
        .replace(/\bview analytics\b/gi, ' ')
        .replace(/\b\d+\s*views?\.?\b/gi, ' ')
        .replace(/\b\d+\s*hours?\s+ago\b/gi, ' ')
        .replace(/\bshow more\b/gi, ' ')
    );
  }

  function collectCardPreviewText(scope, options = {}) {
    if (!scope) return [];
    const includeNested = Boolean(options && options.includeNested);
    const values = [];
    const seen = new Set();
    const push = (value) => {
      const compact = sanitizeText(value || '');
      if (!compact || seen.has(compact)) return;
      // Ignore bare card labels that carry no semantic signal.
      if (/^(x article|article|show more)$/i.test(compact)) return;
      seen.add(compact);
      values.push(compact);
    };

    const cardSelectors = [
      '[data-testid="card.wrapper"]',
      '[data-testid^="card.layout"]',
      '[data-testid*="card.layoutLarge"]',
      '[data-testid*="card.layoutSmall"]'
    ].join(', ');

    scope.querySelectorAll(cardSelectors).forEach(node => {
      if (!includeNested && isNodeWithinNestedTweet(node, scope)) return;
      push(node.innerText || node.textContent || '');
    });

    scope.querySelectorAll('a[aria-label], [role="link"][aria-label]').forEach(node => {
      if (!includeNested && isNodeWithinNestedTweet(node, scope)) return;
      push(node.getAttribute('aria-label') || '');
    });

    scope.querySelectorAll('img[alt], video[aria-label], [data-testid="tweetText"], [dir="auto"]').forEach(node => {
      if (!includeNested && isNodeWithinNestedTweet(node, scope)) return;
      if (node instanceof HTMLImageElement) {
        push(node.getAttribute('alt') || '');
        return;
      }
      push(node.getAttribute?.('aria-label') || node.textContent || '');
    });

    return values.slice(0, 6);
  }

  function extractQuotedContextText(tweet) {
    if (!tweet) return [];
    const quotedTweets = [...tweet.querySelectorAll('article[data-testid="tweet"]')]
      .filter(node => node && node !== tweet)
      .slice(0, 2);
    const results = [];
    const seen = new Set();
    const push = (value) => {
      const compact = sanitizeText(value || '');
      if (!compact || seen.has(compact)) return;
      if (/^(show more|x article|article)$/i.test(compact)) return;
      seen.add(compact);
      results.push(compact);
    };

    quotedTweets.forEach(quoted => {
      const richParts = [];
      const quotedAuthor = [...quoted.querySelectorAll('[data-testid="User-Name"]')]
        .slice(0, 1)
        .map(node => sanitizeText(node.innerText || ''))
        .filter(Boolean);
      richParts.push(...quotedAuthor);

      const quotedTweetText = [...quoted.querySelectorAll('[data-testid="tweetText"]')]
        .map(node => sanitizeText(node.innerText || ''))
        .filter(Boolean);
      richParts.push(...quotedTweetText);

      richParts.push(...collectCardPreviewText(quoted, { includeNested: true }));
      richParts
        .map(part => sanitizeText(part))
        .filter(Boolean)
        .forEach(push);

      // Fallback: include compact quoted innerText when rich selectors are sparse.
      if (richParts.length <= 1) {
        push(String(quoted.innerText || '').slice(0, 420));
      }
    });

    return results.slice(0, 6);
  }

  function sanitizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function upgradeTwitterMediaUrlForVision(value) {
    const normalized = normalizeMediaUrl(value);
    if (!normalized) return '';
    try {
      const parsed = new URL(normalized);
      const host = String(parsed.hostname || '').toLowerCase();
      const path = String(parsed.pathname || '').toLowerCase();
      if (!host.endsWith('pbs.twimg.com')) return parsed.toString();

      if (path.includes('/media/')) {
        parsed.searchParams.set('name', 'orig');
      } else if (
        path.includes('/ext_tw_video_thumb/') ||
        path.includes('/amplify_video_thumb/') ||
        path.includes('/tweet_video_thumb/')
      ) {
        parsed.searchParams.set('name', 'large');
      }
      return parsed.toString();
    } catch {
      return normalized;
    }
  }

  function normalizeMediaUrl(value) {
    if (!value) return '';
    try {
      const parsed = new URL(String(value), window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function isNodeWithinNestedTweet(node, rootTweet) {
    if (!node || !rootTweet) return false;
    const nestedTweet = node.closest('article[data-testid="tweet"]');
    return Boolean(nestedTweet && nestedTweet !== rootTweet);
  }

  function extractStyleBackgroundUrl(styleValue) {
    if (!styleValue || typeof styleValue !== 'string') return '';
    const match = styleValue.match(/url\((['"]?)(.*?)\1\)/i);
    return match && match[2] ? match[2] : '';
  }

  function extractPreferredSrcFromSrcset(srcsetValue) {
    if (!srcsetValue || typeof srcsetValue !== 'string') return '';
    const candidates = srcsetValue
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.split(/\s+/)[0])
      .filter(Boolean);
    if (candidates.length === 0) return '';
    return candidates[candidates.length - 1];
  }

  function tweetLikelyHasMedia(tweet) {
    if (!tweet) return false;
    return Boolean(
      tweet.querySelector(
        [
          'div[data-testid="tweetPhoto"]',
          '[data-testid="videoPlayer"]',
          '[data-testid="videoComponent"]',
          'a[href*="/photo/"]',
          'a[href*="/video/"]',
          'img[src*="pbs.twimg.com/"]',
          'img[srcset*="pbs.twimg.com/"]',
          '[style*="pbs.twimg.com/"]'
        ].join(', ')
      )
    );
  }

  function tweetLikelyHasDeferredTextContext(tweet) {
    if (!tweet) return false;
    return Boolean(
      tweet.querySelector('article[data-testid="tweet"]') ||
      tweet.querySelector('[data-testid="card.wrapper"]') ||
      tweet.querySelector('[data-testid^="card.layout"]')
    );
  }

  function scoreTweetTextQuality(text) {
    const normalized = sanitizeText(text || '').toLowerCase();
    if (!normalized) return 0;
    let score = normalized.length;
    if (/\b(claude|anthropic|openai|unitree|optimus|robot|humanoid|bitcoin|stacks)\b/.test(normalized)) {
      score += 200;
    }
    if (/\bview post analytics\b/.test(normalized)) {
      score -= 120;
    }
    if (/\bshow more\b/.test(normalized)) {
      score -= 40;
    }
    return score;
  }

  async function resolveTweetTextContext(tweet) {
    let best = extractPrimaryTweetText(tweet);
    const shouldProbe =
      tweetLikelyHasDeferredTextContext(tweet) ||
      /\bshow more\b/i.test(best) ||
      best.length < 180;
    const attempts = shouldProbe ? 4 : 2;
    const probeDelayMs = shouldProbe ? 45 : 25;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, probeDelayMs));
      const next = extractPrimaryTweetText(tweet);
      if (scoreTweetTextQuality(next) > scoreTweetTextQuality(best)) {
        best = next;
      }
      if (scoreTweetTextQuality(best) >= 380 && !/\bshow more\b/i.test(best)) {
        break;
      }
    }

    return best;
  }

  function extractTweetMediaContext(tweet, options = {}) {
    if (!tweet) return [];
    const includeNested = Boolean(options && options.includeNested);

    const assets = [];
    const seen = new Set();
    const pushAsset = (asset) => {
      const type = asset?.type === 'video' ? 'video' : asset?.type === 'image' ? 'image' : '';
      if (!type) return;

      const normalized = {
        type,
        url: upgradeTwitterMediaUrlForVision(asset.url || ''),
        poster_url: upgradeTwitterMediaUrlForVision(asset.poster_url || ''),
        alt_text: sanitizeText(asset.alt_text || '').slice(0, 160)
      };
      if (!normalized.url && !normalized.poster_url && !normalized.alt_text) return;

      const key = `${normalized.type}|${normalized.url}|${normalized.poster_url}|${normalized.alt_text}`;
      if (seen.has(key)) return;
      seen.add(key);
      assets.push(normalized);
    };

    tweet.querySelectorAll(
      [
        'div[data-testid="tweetPhoto"] img',
        'img[src*="pbs.twimg.com/media/"]',
        'img[src*="pbs.twimg.com/ext_tw_video_thumb/"]',
        'img[src*="pbs.twimg.com/amplify_video_thumb/"]',
        'img[src*="pbs.twimg.com/tweet_video_thumb/"]',
        'img[src*="pbs.twimg.com/card_img/"]'
      ].join(', ')
    ).forEach(img => {
      if (!includeNested && isNodeWithinNestedTweet(img, tweet)) return;

      const src = normalizeMediaUrl(
        img.currentSrc ||
        img.getAttribute('src') ||
        extractPreferredSrcFromSrcset(img.getAttribute('srcset') || '')
      );
      const directAlt = sanitizeText(img.getAttribute('alt') || '');
      const contextualAlt = sanitizeText(
        img.closest('[data-testid="card.wrapper"], [data-testid^="card.layout"], article[data-testid="tweet"]')?.innerText || ''
      ).slice(0, 160);
      const alt = directAlt || contextualAlt;
      if (!src) return;
      if (/profile_images/i.test(src)) return;
      if (/profile_banners/i.test(src)) return;
      if (/\/emoji\//i.test(src)) return;
      if (/^(image|photo|gif)$/i.test(alt)) {
        pushAsset({ type: 'image', url: src });
        return;
      }
      pushAsset({ type: 'image', url: src, alt_text: alt });
    });

    tweet.querySelectorAll('[data-testid="videoPlayer"] video, [data-testid="videoComponent"] video, video').forEach(video => {
      if (!includeNested && isNodeWithinNestedTweet(video, tweet)) return;
      const src = normalizeMediaUrl(video.currentSrc || video.src || video.getAttribute('src') || '');
      const poster = normalizeMediaUrl(video.getAttribute('poster') || '');
      if (/profile_images|profile_banners/i.test(src) || /profile_images|profile_banners/i.test(poster)) return;
      const label = sanitizeText(video.getAttribute('aria-label') || '');
      pushAsset({
        type: 'video',
        url: src,
        poster_url: poster,
        alt_text: label
      });
    });

    tweet.querySelectorAll('a[href*="/video/"], a[href*="ext_tw_video_thumb"], a[href*="amplify_video_thumb"]').forEach(anchor => {
      if (!includeNested && isNodeWithinNestedTweet(anchor, tweet)) return;
      const href = normalizeMediaUrl(anchor.getAttribute('href') || anchor.href || '');
      const label = sanitizeText(anchor.getAttribute('aria-label') || anchor.textContent || '');
      const poster = normalizeMediaUrl(
        anchor.querySelector('img')?.currentSrc ||
        anchor.querySelector('img')?.getAttribute('src') ||
        extractPreferredSrcFromSrcset(anchor.querySelector('img')?.getAttribute('srcset') || '')
      );
      if (!href) return;
      pushAsset({
        type: 'video',
        url: href,
        poster_url: poster,
        alt_text: label
      });
    });

    tweet.querySelectorAll('[style*="pbs.twimg.com/"]').forEach(node => {
      if (!includeNested && isNodeWithinNestedTweet(node, tweet)) return;
      const inlineStyle = String(node.getAttribute('style') || '');
      const bgUrl = normalizeMediaUrl(extractStyleBackgroundUrl(inlineStyle));
      if (!bgUrl) return;
      if (/profile_images|profile_banners/i.test(bgUrl)) return;
      if (/ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb/i.test(bgUrl)) {
        pushAsset({ type: 'video', poster_url: bgUrl });
      } else {
        pushAsset({ type: 'image', url: bgUrl });
      }
    });

    // Some media gets attached via computed styles after hydration.
    tweet.querySelectorAll('div, span').forEach(node => {
      if (!includeNested && isNodeWithinNestedTweet(node, tweet)) return;
      const computedStyle = window.getComputedStyle(node);
      const bg = extractStyleBackgroundUrl(computedStyle.backgroundImage || '');
      const bgUrl = normalizeMediaUrl(bg);
      if (!bgUrl || !/pbs\.twimg\.com/i.test(bgUrl)) return;
      if (/profile_images|profile_banners/i.test(bgUrl) || /\/emoji\//i.test(bgUrl)) return;
      if (/ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb/i.test(bgUrl)) {
        pushAsset({ type: 'video', poster_url: bgUrl });
      } else {
        pushAsset({ type: 'image', url: bgUrl });
      }
    });

    return assets.slice(0, 8);
  }

  async function resolveTweetMediaContext(tweet) {
    let assets = extractTweetMediaContext(tweet);
    if (assets.length > 0) return assets;
    if (!tweetLikelyHasMedia(tweet)) return assets;

    const attempts = 6;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 90));
      assets = extractTweetMediaContext(tweet);
      if (assets.length > 0) {
        return assets;
      }
    }
    // If outer tweet media isn't ready/available, include quoted tweet/card media as fallback context.
    assets = extractTweetMediaContext(tweet, { includeNested: true });
    return assets;
  }

  async function injectTweetLayer(tweet) {
    if (!tweet || tweet.getAttribute('data-im-processing') === 'true') {
      return;
    }
    tweet.setAttribute('data-im-processing', 'true');

    try {
      const tweetText = await resolveTweetTextContext(tweet);
      if (!tweetText || tweetText.length < 10) {
        tweet.setAttribute('data-im-injected', 'true');
        return;
      }
      const mediaContext = await resolveTweetMediaContext(tweet);
      const match = await findBestMarketForTweetWithAi(tweetText, mediaContext);
      if (typeof console.debug === 'function' && typeof getTweetSearchDebug === 'function') {
        const debugInfo = getTweetSearchDebug(tweetText);
        if (debugInfo) {
          console.debug('[InstaMarket] Match decision:', {
            tweet: tweetText.slice(0, 120),
            matched: Boolean(match),
            confidence: match?.confidence ?? 0,
            market: match?.market?.question?.slice(0, 80) ?? null,
            source: match?.source ?? null,
            ...debugInfo
          });
        }
      }
      if (!match) {
        const retryCount = Number(tweet.getAttribute('data-im-retries') || '0');
        const hasDeferredSignal = mediaContext.length === 0 && (
          tweetLikelyHasMedia(tweet) ||
          Boolean(tweet.querySelector('article[data-testid="tweet"]')) ||
          Boolean(tweet.querySelector('[data-testid="card.wrapper"]'))
        );

        if (!marketUniverseHydrated || (hasDeferredSignal && retryCount < 1)) {
          tweet.setAttribute('data-im-retries', String(retryCount + 1));
          tweet.setAttribute('data-im-injected', 'nomatch');
          setTimeout(() => {
            if (tweet.getAttribute('data-im-injected') === 'nomatch') {
              tweet.removeAttribute('data-im-injected');
            }
          }, marketUniverseHydrated ? 4000 : 2500);
        } else {
          tweet.setAttribute('data-im-injected', 'true');
        }
        return;
      }
      const market = match.market;
      const researchSummary = buildResearchSummary(tweetText, match, mediaContext);
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
