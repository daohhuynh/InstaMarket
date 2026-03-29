(function () {
  "use strict";

  let sidebarMounted = false;

  // ── 1. INITIALIZE ───────────────────────────────────────
  async function init() {
    mountSidebar();
    mountDittoButton(); // This is now safe
    await hydrateMarketUniverse();
    observeTweets();
  }

  // ── 2. SIDEBAR LOGIC ────────────────────────────────────
  function mountSidebar() {
    if (sidebarMounted) return;
    sidebarMounted = true;
    if (typeof createSidebar === "function") createSidebar();
    mountCollapseToggle();

    const style = document.createElement("style");
    style.textContent = `
      @media (min-width: 1280px) {
        main[role="main"] { margin-right: 380px !important; transition: margin-right 0.3s ease; }
        main[role="main"].im-sidebar-hidden { margin-right: 0 !important; }
        [data-testid="sidebarColumn"] { display: none !important; }
      }
      /* THE BOX KILLER CSS */
      #im-ditto-btn {
        all: unset !important;
        position: fixed !important;
        z-index: 99999 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: transform 0.2s ease !important;
      }
      #im-ditto-btn:hover { transform: scale(1.1) !important; }
      #im-ditto-btn img {
        width: 50px !important;
        height: 50px !important;
        image-rendering: pixelated !important;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function mountCollapseToggle() {
    if (document.getElementById("im-sidebar-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "im-sidebar-toggle";
    btn.innerHTML = "❯";
    btn.addEventListener("click", () => {
      const sidebar = document.getElementById("im-sidebar");
      const main = document.querySelector('main[role="main"]');
      if (!sidebar) return;
      const collapsed = sidebar.classList.toggle("im-collapsed");
      btn.innerHTML = collapsed ? "❮" : "❯";
      if (main) main.classList.toggle("im-sidebar-hidden", collapsed);
    });
    document.body.appendChild(btn);
  }

  // ── 3. DITTO BUTTON (THE FIX) ───────────────────────────
  function alignDitto() {
    const btn = document.getElementById("im-ditto-btn");
    const grok = document.querySelector('[data-testid="GrokDrawer"]');
    if (!btn || !grok) return;

    const rect = grok.getBoundingClientRect();
    const size = rect.width;
    const gap = 16;

    btn.style.left = rect.left + "px";
    btn.style.top = rect.top - size - gap + "px";
    btn.style.width = size + "px";
    btn.style.height = size + "px";
  }

  function mountDittoButton() {
    if (document.getElementById("im-ditto-btn")) return;
    const btn = document.createElement("button");
    btn.id = "im-ditto-btn";
    btn.innerHTML = `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png">`;
    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      if (typeof toggleDittoModal === "function") toggleDittoModal();
    });

    // Auto-align on resize/scroll/load
    window.addEventListener("resize", alignDitto);
    setInterval(alignDitto, 1000); // Heartbeat alignment check
    alignDitto();
  }

  // ── 4. TWEET INJECTION ──────────────────────────────────
  function observeTweets() {
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll(
          'article[data-testid="tweet"]:not([data-im-injected])',
        )
        .forEach(injectTweetLayer);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach(injectTweetLayer);
  }

  async function injectTweetLayer(tweet) {
    tweet.setAttribute("data-im-injected", "true");
    const tweetText = tweet.innerText;

    // Check if matcher exists to avoid crashes
    if (typeof findBestMarketForTweetWithAi !== "function") return;

    const match = await findBestMarketForTweetWithAi(tweetText);
    if (!match) return;

    const market = match.market;
    const layer = document.createElement("div");
    layer.className = "im-tweet-layer";
    layer.innerHTML = `
      <div class="im-market-question">Market: <span>${market.question}</span></div>
      <div class="im-tweet-actions">
        <button class="im-bet-yes" data-market="${market.id}" data-side="YES">YES ${market.yesOdds}%</button>
        <button class="im-bet-no" data-market="${market.id}" data-side="NO">NO ${market.noOdds}%</button>
      </div>
    `;

    const actionRow = tweet.querySelector('[role="group"]');
    if (actionRow)
      actionRow.parentNode.insertBefore(layer, actionRow.nextSibling);
  }

  // Helper mocks/utils to prevent init crashes
  function hydrateMarketUniverse() {
    console.log("Hydrating...");
  }

  // ── 5. BOOT ─────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
