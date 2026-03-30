# InstaMarket

InstaMarket is a local, multi-service prediction-market assistant for X/Twitter workflows.

It combines:
- a Chrome extension that detects posts and surfaces related Polymarket markets,
- an AI research + matching API,
- a bridge service for persona simulation + paper trade submission,
- a low-latency CLOB engine for trade ingestion,
- and an optional dashboard for monitoring activity.

## Repository Structure

- `person1_clob/` — C++ matching engine + market/orderbook endpoints
- `person2/` — AI match + thesis backend (`/v1/match-market`, `/v1/research-thesis`)
- `person3/chrome-extension/` — extension UI, tweet injection, sidebar, research UX
- `integration_bridge/` — bridge API (`/api/persona-sim`, `/api/bet`, paper-trade piping)
- `person4/` — stop-loss daemon
- `instamarket-dashboard/` — React/Vite dashboard
- `shared_schemas/` — shared contract files

## High-Level Flow

1. Extension reads tweet context and asks Person2 for best market match.
2. Person2 queries live market data + scraper evidence and returns a thesis.
3. Extension can run persona simulation via Integration Bridge.
4. Bridge can forward paper trades to Person1 CLOB.
5. Sidebar + dashboard reflect research, saved markets, and bets.

## Ports and Services

- `8080` — Person1 CLOB (`person1_clob/src/main.cpp`)
- `8787` — Person2 AI API
- `3000` — Integration Bridge API
- `4173` — Dashboard dev server (Vite default in this repo)

## Quick Start (Local)

### 1) Person1 CLOB

```bash
cd person1_clob/src
g++ -O3 -std=c++17 -o clob_engine main.cpp
./clob_engine
```

### 2) Integration Bridge

```bash
cd integration_bridge
npm install
node server.js
```

### 3) Person2 AI API

```bash
cd person2
npm install
cp .env.example .env.local
npm run match-api
```

### 4) Chrome Extension

1. Open Chrome -> `chrome://extensions`
2. Enable Developer mode
3. Load unpacked -> `person3/chrome-extension`
4. Open X/Twitter and use the injected market cards + sidebar

### 5) Dashboard (optional)

```bash
cd instamarket-dashboard
npm install
npm run dev
```

## Environment Variables (Common)

### Person2 (`person2/.env.local`)

Typical values used during local runs:
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- scraper tuning / credentials (optional):
  - `APIFY_API_TOKEN`
  - `YOUTUBE_API_KEY`
  - `SCRAPER_PROCESS_TIMEOUT_MS`
  - `SCRAPER_PYTHON_BIN`

### Integration Bridge (`integration_bridge/.env`)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SOLANA_RPC`
- (optional) Bedrock credentials if simulation uses Bedrock-backed paths

## Useful Commands

### Person2

```bash
npm run build
npm run test
npm run verify-scrapers
npm run match-api
```

### Dashboard

```bash
npm run dev
npm run build
npm run preview
```

## Troubleshooting

### `vite: command not found`

Run `npm install` inside `instamarket-dashboard/`.

### `fatal error: 'vector' file not found` (macOS)

This is a local toolchain/header issue. Use Homebrew GCC (`g++-15`) or repair Xcode Command Line Tools.

### `Source collection degraded; continuing with fallback seeds`

Person2 scraper could not fully collect live sources and switched to deterministic fallback seeds. Check scraper credentials, network, and `person2` logs.

## Module-Specific Docs

- [Person1 CLOB](/Users/petarisakovic/Desktop/InstaPoly/InstaMarket/person1_clob/README.md)
- [Person2 AI Module](/Users/petarisakovic/Desktop/InstaPoly/InstaMarket/person2/README.md)
- [Integration Bridge](/Users/petarisakovic/Desktop/InstaPoly/InstaMarket/integration_bridge/README.md)
- [Person4 Risk Daemon](/Users/petarisakovic/Desktop/InstaPoly/InstaMarket/person4/README.md)
- [Person3 Extension](/Users/petarisakovic/Desktop/InstaPoly/InstaMarket/person3/chrome-extension/README.md)

## Notes

- This repo is organized by person/module ownership for parallel development.
- If you are demoing locally, start services in this order: `person1_clob` -> `integration_bridge` -> `person2` -> extension -> dashboard.
