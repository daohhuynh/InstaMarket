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
- Cross-origin market fetches are routed through `src/background/worker.js` to avoid `x.com` CORS failures.
- Loader resiliency: retries + fallback to `events` endpoint + cached market universe fallback.

### Bedrock rerank (first 5 tweets per refresh)
- `findBestMarketForTweetWithAi(tweetText)` uses parser candidates first.
- For the first 5 tweets on each page load, it calls `http://localhost:8787/v1/match-market` to rerank using Bedrock.
- After 5 calls, it falls back to parser-only matching for the rest of the page until refresh.
- If API is unavailable, it falls back automatically to parser results.
- Market universe now loads from multiple paginated Polymarket slices (not just a single top-volume page), so niche topics are easier to match.

### Live-only data flow
There are no runtime mock constants in the extension now.

- Markets are fetched from:
  `GET https://gamma-api.polymarket.com/markets?active=true&closed=false`
- Portfolio/Saved data is created from user actions in the extension and stored locally.
- Ditto modal shows live local activity stats until a real matchmaker backend is connected.

### Tweet-to-market matching
The extension uses a deterministic parser in `src/content/data.js`:
- `findBestMarketForTweet(tweetText)` scores every market using phrase + token overlap.
- `buildResearchSummary(tweetText, match)` builds parser reasoning for the sidebar.
- `inject.js` adds a `Research` button next to YES/NO/Save and opens parser research in the Markets tab.

No Bedrock calls are required for this matching flow. Optional Bedrock reranking is still supported for the first 5 tweets per page load.

If you update `manifest.json` host permissions, reload the extension in `chrome://extensions`.

If you see `Unable to load live Polymarket markets: TypeError: Failed to fetch`, click **Reload** on the extension once so the background worker is re-registered.

To enable optional Bedrock reranking for the first 5 tweets, run the Person 2 API:

```bash
cd ../person2
npm run match-api
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
