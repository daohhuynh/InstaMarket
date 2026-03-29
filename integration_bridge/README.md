# Integration Bridge

This service translates backend portfolio/market data into the shape consumed by the extension.

## Environment

Create `.env` in this folder with:

```env
SUPABASE_URL=tcmtemxryuzleovvbavz
SUPABASE_ANON_KEY=sb_secret_dVyFn-z-pD2lGRHeqfHA_8bpbUIQl
SOLANA_RPC=http://127.0.0.1:8899/
```

## Run

```bash
cd integration_bridge
npm install
npm start
```

Bridge runs on `http://localhost:3000` by default.

## Person2 Submit Flow

```bash
cd person2
CLOB_ENDPOINT=http://localhost:8080/api/paper-trades npm run simulate -- \
  --post-url https://x.com/some_post \
  --market-state-file ../shared_schemas/market_state.json \
  --comments-file ./examples/comments.json \
  --submit
```
