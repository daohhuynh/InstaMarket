# InstaMarket

InstaMarket is a local, multi-service prediction-market assistant for X/Twitter workflows.

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
