# InstaMarket Chrome Extension

Polymarket × Twitter. Bet on live markets while doomscrolling.

---

## Install & Run (30 seconds)

1. Open Chrome → go to `chrome://extensions`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Select this folder: `person3/chrome-extension/`
5. Open [twitter.com](https://twitter.com) or [x.com](https://x.com)

Done. You'll see the InstaMarket sidebar replace Twitter's right sidebar, the Ditto button floating bottom-right, and market pills injected under tweets about GPT-5, TikTok, Bitcoin, Tesla, or the Fed.

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
│   │   ├── data.js            # ← HARDCODED DATA (swap for live APIs here)
│   │   └── inject.js          # Tweet detector + DOM injection
│   └── sidebar/
│       └── sidebar.js         # Sidebar renderer (Portfolio / Markets / Saved)
```

---

## Integration Guide for Teammates

All hardcoded data lives in **`src/content/data.js`**. Each constant maps 1:1 to a live data source.

### `MOCK_MARKETS` → Polymarket API
```js
// Replace with: GET https://gamma-api.polymarket.com/markets
// Each market needs: id, question, yesOdds, noOdds, volume, keywords[]
// keywords[] is what gets matched against tweet text — your NLP layer feeds this
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

### Tweet keyword matching
In `inject.js`, `findMarketForTweet(text)` does naive keyword matching.
Replace with your NLP/embedding similarity layer:
```js
function findMarketForTweet(tweetText) {
  // YOUR CODE: call your market-matching API
  // return a market object or null
}
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
