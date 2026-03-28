# InstaMarket Chrome Extension

Polymarket × Twitter. Bet on live markets while doomscrolling.

---

## Install & Run (30 seconds)

1. Open Chrome → go to `chrome://extensions`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Select this folder: `person3/chrome-extension/`
5. Open [twitter.com](https://twitter.com) or [x.com](https://x.com)

Done. You'll see the InstaMarket sidebar replace Twitter's right sidebar, the Ditto button floating bottom-right, and market action pills injected under tweets that match existing markets.

---

## Folder Structure

```
chrome-extension/
├── manifest.json              # Chrome extension config
├── popup.html                 # Popup shown when clicking the extension icon
├── assets/icons/              # Extension icons (16/48/128px)
├── src/
│   ├── styles/main.css        # ALL styling — Polymarket design system
│   ├── content/
│   │   ├── data.js            # Live Polymarket fetch + offline matcher
│   │   └── inject.js          # Tweet detector + DOM injection + Research button
│   └── sidebar/
│       └── sidebar.js         # Sidebar renderer (Portfolio / Markets / Saved)
```

---

## Integration Guide for Teammates

Live market matching lives in **`src/content/data.js`**:
- `loadPolymarketMarketUniverse()` fetches active markets from `gamma-api.polymarket.com`.
- `findBestMarketForTweet(tweetText)` scores each tweet against the live market universe (no AWS).
- `buildResearchSummary(...)` feeds the Research card in the sidebar.

### Bedrock rerank (first 5 tweets per refresh)
- `findBestMarketForTweetWithAi(tweetText)` uses parser candidates first.
- For the first 5 tweets on each page load, it calls `http://localhost:8787/v1/match-market` to rerank using Bedrock.
- After 5 calls, it falls back to parser-only matching for the rest of the page until refresh.
- If API is unavailable, it falls back automatically to parser results.

### `MOCK_MARKETS` → Polymarket API
```js
// Fallback only (used if live fetch fails)
// Primary source is live fetch from:
// GET https://gamma-api.polymarket.com/markets?active=true&closed=false
```

### `MOCK_AGENTS` → AI Swarm Agent outputs
```js
// Each agent object maps to one swarm agent result:
// { id, source, insight: string, reasoning: [{step, text}] }
// Your agent runner should return this shape per agent
// insight = one-line summary | reasoning = step-by-step chain
```

### `MOCK_RISK` → Risk scoring model
```js
// { resolution: {value: 0-100, level: 'low'|'med'|'high'}, event: {...}, liquidity: {...} }
// Feed from your portfolio/risk agent output
```

### `MOCK_RECOMMENDATION` → Portfolio agent
```js
// { action, market, size, hedge, reasoning }
// Final synthesis from your portfolio management agent
```

### `MOCK_PORTFOLIO` → User's live portfolio
```js
// totalValue, dailyPnl, dailyPnlPct, winRate, avgReturn
// positions[]: { title, side, stake, pnl, pnlPct, positive }
// history[]: { title, side, stake, pnl, date, positive }
// Source: your backend / Polymarket user positions API
```

### `MOCK_SAVED` → Saved markets store
```js
// savedAt, savedOdds, currentOdds, delta, favorable
// Store in chrome.storage.local, update odds on load
```

### `MOCK_PERSONAS` → Comment persona simulation
```js
// Extracted from tweet reply authors
// { handle, emoji, portfolioSize, bet, outcome, won, reasoning }
// Your persona simulation agent fills these
```

### `DITTO_PROFILES` → Matchmaking service
```js
// { name, emoji, color, matchPct, reason }
// v1: hardcoded | v2: real matching from InstaMarket user database
```

### Tweet-to-market matching (no API credits)
The extension now uses an offline text parser in `src/content/data.js`:
- `findBestMarketForTweet(tweetText)` scores every market using phrase + token overlap.
- `buildResearchSummary(tweetText, match)` builds parser reasoning for the sidebar.
- `inject.js` adds a `Research` button next to YES/NO/Save and opens parser research in the Markets tab.

No Bedrock calls are required for this matching flow.

If you update `manifest.json` host permissions, reload the extension in `chrome://extensions`.

To enable Bedrock reranking for the first 5 tweets, run the Person 2 API:

```bash
cd ../person2
npm run match-api
```

### Payoff curve chart
`PAYOFF_CURVE_DATA` in `data.js` — replace with real payoff calculation:
```js
// [{x: priceIn, y: payout}] — computed from your open positions book
```

---

## Design System

All colors/spacing live in CSS variables at the top of `src/styles/main.css`:
```css
--pm-green: #00c853    /* YES / positive / up arrows */
--pm-red: #ff3d57      /* NO / negative / down arrows */
--pm-purple: #7c3aed   /* Ditto / recommendations */
--pm-yellow: #f5a623   /* Warnings / hedges */
--pm-bg: #0d0f13       /* Main background */
--pm-surface: #161a23  /* Card background */
```
