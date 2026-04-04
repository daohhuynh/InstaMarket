# InstaMarket

InstaMarket is a local, multi-service prediction-market assistant for X/News workflows.

It combines:
* A Chrome extension that detects posts and surfaces related Polymarket markets.
* An AI research + matching API.
* A bridge service for persona simulation + paper trade submission.
* A low-latency CLOB engine for trade ingestion.
* An optional dashboard for monitoring activity.

### System Architecture & Performance
* **Core Matching Engine (C++):** Built for strict low-latency ingestion. Utilizes contiguous data structures (`std::vector`/`std::array`) with flattened hash tables to optimize CPU cache utilization. 
* **Zero-Allocation Hot Path:** Pre-allocated capacities ensure zero heap allocations (`new`/`malloc`) during active order matching and execution.
* **Risk Daemon:** Asynchronous stop-loss monitoring detached from the primary matching thread.

### Repository Structure
* `person1_clob/` — **Core Matching Engine:** Bare-metal C++ matching engine + market/orderbook endpoints.
* `person2/` — **AI Thesis Backend:** Match + thesis generation API (`/v1/match-market`, `/v1/research-thesis`).
* `person3/chrome-extension/` — **Client Extension:** UI, tweet injection, sidebar, and research UX.
* `integration_bridge/` — **Integration API:** Bridge service (`/api/persona-sim`, `/api/bet`, paper trade piping).
* `person4/` — **Risk Daemon:** Asynchronous stop-loss daemon.
* `instamarket-dashboard/` — **Frontend Client:** React/Vite monitoring dashboard.
* `shared_schemas/` — Shared contract files.

### High-Level Flow
1. Extension reads tweet context and asks AI Thesis Backend for the best market match.
2. AI Backend queries live market data + scraper evidence and returns a thesis.
3. Extension can run persona simulation via Integration Bridge.
4. Bridge can forward paper trades to the Core Matching Engine.
5. Sidebar + dashboard reflect research, saved markets, and bets.

### Ports and Services
* `8080` — Core Matching Engine (`person1_clob/src/main.cpp`)
* `8787` — AI Thesis Backend API
* `3000` — Integration Bridge API
* `4173` — Dashboard dev server (Vite default)

### Quick Start (Local)

**1) Core Matching Engine (CLOB)**
```bash
cd person1_clob/src
g++ -O3 -std=c++20 -march=native -o clob_engine main.cpp
./clob_engine
```

**2) Integration Bridge**
```bash
cd integration_bridge
npm install
node server.js
```

**3) AI Thesis Backend API**
```bash
cd person2
npm install
cp .env.example .env.local
npm run match-api
```

**4) Chrome Extension**
1. Open Chrome -> `chrome://extensions`
2. Enable Developer mode
3. Load unpacked -> `person3/chrome-extension`
4. Open X/Twitter and use the injected market cards + sidebar

**5) Dashboard (optional)**
```bash
cd instamarket-dashboard
npm install
npm run dev
```

### Environment Variables (Common)

**AI Thesis Backend (`person2/.env.local`)**
Typical values used during local runs:
* `AWS_REGION`
* `BEDROCK_MODEL_ID`
* Scraper tuning / credentials (optional): `APIFY_API_TOKEN`, `YOUTUBE_API_KEY`, `SCRAPER_PROCESS_TIMEOUT_MS`, `SCRAPER_PYTHON_BIN`

**Integration Bridge (`integration_bridge/.env`)**
* `SUPABASE_URL`
* `SUPABASE_ANON_KEY`
* `SOLANA_RPC`
* *(Optional)* Bedrock credentials if simulation uses Bedrock-backed paths.

### Useful Commands

**AI Thesis Backend**
```bash
npm run build
npm run test
npm run verify-scrapers
npm run match-api
```

**Dashboard**
```bash
npm run dev
npm run build
npm run preview
```

### Troubleshooting

* **`vite: command not found`**
Run `npm install` inside `instamarket-dashboard/`.

* **`fatal error: 'vector' file not found` (macOS)**
This is a local toolchain/header issue. Use Homebrew GCC (`g++-15`) or repair Xcode Command Line Tools.

* **Source collection degraded; continuing with fallback seeds**
Scraper could not fully collect live sources and switched to deterministic fallback seeds. Check scraper credentials, network, and `person2` logs.

### Notes
This repo is organized by module ownership for parallel development. If you are demoing locally, start services in this order: `person1_clob` -> `integration_bridge` -> `person2` -> extension -> dashboard.
