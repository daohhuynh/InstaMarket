# InstaMarket

**Bare-metal C++20 limit order book and matching engine.**

InstaMarket is a deterministic trading engine built to minimize network-to-execution latency. It strips away standard application overhead, relying on POSIX network primitives, zero-copy parsing, and strict heap-allocation bans to maintain absolute $O(1)$ execution guarantees.

## The Critical Path: Data Ingress to Egress

The engine's data flow is designed around a single-threaded event loop (`accept()` → `read()` → parse → match → `write()` → `close()`), explicitly eliminating OS context switching and cache coherency overhead. 

* **Ingress:** Data enters via POSIX sockets (`AF_INET`, `SOCK_STREAM` with `SO_REUSEADDR`). Instead of standard string manipulation or JSON libraries, the engine utilizes a custom `ZeroAllocJsonParser`. It operates directly on an 8KB stack-allocated socket buffer using compiler-optimized `__builtin_memcpy`. HTTP headers are parsed manually via `std::string_view`, bypassing the heap allocator entirely during the hot path.
* **Compute (Matching Engine):** The CLOB enforces strict price-time priority. Because prices are constrained to a fixed 1-99¢ tick range, the matching algorithm operates at an effective $O(1)$ lookup latency via direct array indexing. 
* **Egress:** Fill reports are generated inline. The engine aggregates `total_filled` and `total_cost` continuously during the matching loop, eliminating the need for a secondary post-processing pass before socket writes. 

## Memory & Cache Architecture

Dynamic memory allocation is the primary enemy of deterministic execution. The CLOB architecture is heavily pre-allocated to prevent reallocation pauses during high-throughput bursts.

* **Stack Allocation & Fixed Capacity:** The engine pre-reserves 1,024 markets upfront. Both the YES and NO books are mapped to stack-allocated `std::array<PriceLevel, 100>` instances, representing 200 contiguous price levels per market.
* **Struct-of-Arrays Layout:** Each `PriceLevel` reserves 8,192 order slots at construction time. Orders are stored contiguously to guarantee cache-friendly iteration.
* **Lazy Deletion:** Resting orders are not actively erased mid-vector (which would trigger cache invalidation and $O(N)$ shifts). Order recycling is handled via lazy deletion—the head pointer simply increments. Orders remain in memory until the entire price level is cleared.

## CPU Mechanics & Execution State

Pipeline stalls destroy microsecond latency. The matching engine's execution path is structured to maximize compiler optimizations and CPU throughput.

* **Inline & Move Semantics:** The `submit()` method is explicitly marked `inline` for compiler injection into the hot path. `Order&&` move construction is enforced to eliminate copy overhead when inserting resting orders into the book. 
* **Branchless Optimizations:** Standard `if/else` control flows are minimized to prevent CPU branch mispredictions. The engine relies on ternary operators (e.g., `(side == Side::Yes) ? no_book : yes_book`), `std::min` clamping, and boolean arithmetic (e.g., `level.head += (top.quantity == 0)`) which are heavily optimized by the `-O3` and `-march=native` compiler flags to emit CMOV (Conditional Move) instructions.

## Quantitative Math & Stability

* **Integer-Only Arithmetic:** Floating-point non-determinism is entirely banned. All prices and quantities are represented as `uint64_t` (cents and whole shares). This eliminates rounding errors, unit confusion, and ensures 100% deterministic matching logic.
* **JSON Parsing Robustness:** Number extraction utilizes C++17 `std::from_chars`, providing locale-independent integer parsing that is significantly faster than `std::stoi` and guarantees zero exceptions on invalid inputs.

## System Overview

InstaMarket is a polyglot prediction-market stack that brings market discovery, AI research, and paper-trade execution directly into content surfaces. It matches live Polymarket data to X/Twitter posts, generates AI-backed theses via AWS Bedrock (Amazon Nova Lite), simulates crowd flow through persona agents, and routes paper trades into the CLOB described above.

## Core Features

* **Content-Native Market Matching:** A Manifest V3 Chrome extension scans X/Twitter and Washington Post pages, scoring and injecting live Polymarket candidate markets directly into your feed.
* **AI Research Thesis Generation:** A 4-agent AWS Bedrock pipeline (Market Analyst → Evidence Analyst → Resolution Analyst → PM Synthesizer) scrapes cross-platform evidence (X, Reddit, Google News) to output fair probability, catalysts, risk flags, and suggested trade sizing with stop-loss.
* **Swarm / Persona Trade Simulation:** A Node.js bridge turns social comments into deterministic persona profiles, running risk/portfolio agents to simulate market flow and submit paper trades.
* **Risk Automation:** A Supabase-realtime risk daemon monitors positions for automated stop-loss management, decoupled from the matching thread.

## Tech Stack

* **Frontend:** Chrome Extension (Manifest V3), React 18 / Vite, Framer Motion
* **Backend & Orchestration:** Node.js, Express 5, TypeScript/JavaScript microservices
* **Execution Engine:** Bare-metal C++23 in-memory CLOB
* **AI & Inference:** AWS Bedrock (`amazon.nova-lite-v1:0`)
* **Data & Persistence:** Supabase (Postgres + Realtime), Polymarket Gamma API
* **Web3:** Solana localnet (`@solana/web3.js`), SPL token tooling

## Repository Structure

* `person1_clob/` — Core matching engine + orderbook endpoints (C++23)
* `person2/` — AI thesis backend (`/v1/match-market`, `/v1/research-thesis`)
* `person3/chrome-extension/` — Client extension: tweet injection, sidebar, research UX
* `integration_bridge/` — Bridge service (`/api/persona-sim`, `/api/bet`, paper trade piping)
* `person4/` — Asynchronous stop-loss risk daemon
* `instamarket-dashboard/` — React/Vite monitoring dashboard
* `shared_schemas/` — Shared contract files

## High-Level Flow

1. Extension reads tweet context and requests a market match + thesis from the AI backend.
2. AI backend queries live Polymarket data and scraper evidence, returns a thesis.
3. Extension can trigger persona simulation via the Integration Bridge.
4. Bridge forwards paper trades to the CLOB engine.
5. Sidebar and dashboard reflect research, saved markets, and bets.

## Ports

| Port | Service |
|------|---------|
| `8080` | Core Matching Engine |
| `8787` | AI Thesis Backend |
| `3000` | Integration Bridge |
| `4173` | Dashboard (Vite) |

## Quick Start

**1) Core Matching Engine**
```bash
cd person1_clob/src
g++ -O3 -std=c++23 -march=native -flto -o clob_engine main.cpp
./clob_engine
```

**2) Integration Bridge**
```bash
cd integration_bridge && npm install && node server.js
```

**3) AI Thesis Backend**
```bash
cd person2 && npm install && cp .env.example .env.local && npm run match-api
```

**4) Chrome Extension**
1. Open `chrome://extensions`, enable Developer mode
2. Load unpacked → `person3/chrome-extension`

**5) Dashboard (optional)**
```bash
cd instamarket-dashboard && npm install && npm run dev
```

## Environment Variables

**`person2/.env.local`**
* `AWS_REGION`, `BEDROCK_MODEL_ID`
* Optional scraper: `APIFY_API_TOKEN`, `YOUTUBE_API_KEY`, `SCRAPER_PROCESS_TIMEOUT_MS`

**`integration_bridge/.env`**
* `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SOLANA_RPC`

## Troubleshooting

* **`vite: command not found`** — Run `npm install` inside `instamarket-dashboard/`.
* **`fatal error: 'vector' file not found` (macOS)** — Use Homebrew GCC (`g++-15`) or repair Xcode Command Line Tools.
* **Source collection degraded** — Scraper fell back to deterministic seeds. Check `person2` logs and scraper credentials.

## Team
* ** Developed in 24 hours for YHack at Yale University
