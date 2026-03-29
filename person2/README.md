# Person 2 Swarm Module (Bedrock + Persona Simulation)

This folder is intentionally scoped to **Person 2 only**:
- AI swarm orchestration (Research, Risk, Portfolio agents)
- X/Twitter comment persona simulation
- Trade generation in `trade_execution` shape for Person 1 CLOB ingestion

It does **not** touch UI code, database schema code, or shared JSON schema files.

## What this module outputs

For each simulation run, it writes:
- `person2_simulation_<timestamp>.json`: full per-persona run output
- `person2_trade_execution_<timestamp>.json`: array of `trade_execution` payloads
- `person2_ai_swarm_thesis_<timestamp>.json`: array of `ai_swarm_thesis` payloads

## Install

```bash
cd person2
npm install
```

## Run (Bedrock)

```bash
cd person2
AWS_REGION=us-east-1 BEDROCK_MODEL_ID=amazon.nova-lite-v1:0 npm run simulate -- \
  --post-url https://x.com/some_post \
  --market-state-file ../shared_schemas/market_state.json \
  --comments-file ./examples/comments.json
```

## Run (local fallback)

```bash
cd person2
npm run simulate -- \
  --post-url https://x.com/some_post \
  --market-state-file ../shared_schemas/market_state.json \
  --comments-file ./examples/comments.json \
  --local-model
```

## Submit to Person 1 CLOB endpoint

```bash
cd person2
CLOB_ENDPOINT=http://localhost:8080/api/paper-trades npm run simulate -- \
  --post-url https://x.com/some_post \
  --market-state-file ../shared_schemas/market_state.json \
  --comments-file ./examples/comments.json \
  --submit
```

## Merge-friendly boundaries

- Shared schema files in `../shared_schemas/*.json` are read-only references.
- Person 1 integration is isolated behind `src/adapters/CLOBGateway.ts` and `src/adapters/MarketStateProvider.ts`.
- Person 4 comment pipeline integration is isolated behind `src/persona/TwitterCommentsSource.ts`.
- Agent logic is isolated in `src/swarm/SwarmOrchestrator.ts`.

## Quick commands

```bash
npm run test
npm run build
```

## Chrome Extension Market-Match API (first 5 tweets)

Run this server so the extension can use Bedrock to rerank parser candidates for the first 5 tweets on each page load:

```bash
cd person2
npm run match-api
```

Endpoint:
- `POST /v1/match-market`
- `POST /v1/extract-market-query` (optional query enhancer for better Polymarket search terms)
- Default URL: `http://localhost:8787/v1/match-market`

Debug logs (enabled by default with `AI_MATCH_DEBUG_LOG=true`) print:
- tweet context snippet
- input parser/public-search queries
- AI query output terms
- top candidate markets and final match decision

Multimodal assist:
- If a tweet has images/videos, the extension sends media metadata to `match-api`.
- With `AI_MATCH_ENABLE_MEDIA=true`, the API tries to attach a small number of media blocks to Bedrock Nova Lite for better context-aware matching.

Example:

```bash
curl -X POST http://localhost:8787/v1/extract-market-query \
  -H "content-type: application/json" \
  -d '{
    "tweet_text":"Unitree robots are being used in hospitals more often now",
    "parser_queries":["unitree robots hospitals"],
    "max_queries":5
  }'
```

Health check:

```bash
curl http://localhost:8787/health
```
