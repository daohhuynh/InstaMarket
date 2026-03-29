# Person4 Risk Daemon

Standalone stop-loss daemon that listens to Supabase realtime market price updates and auto-closes positions through `POST /api/bet`.

## Setup

```bash
cd person4
npm install
cp .env.example .env
cp stop_loss_targets.example.json stop_loss_targets.json
```

Set `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `BETS_API_ENDPOINT` (default `http://localhost:3000/api/bet`)
- `STOP_LOSS_TARGETS_FILE` (default `./stop_loss_targets.json`)

## Run

```bash
npm start
```

## Target Shape

`stop_loss_targets.json` is an array:

```json
[
  {
    "market_id": "1",
    "wallet_address": "demo_wallet_extension_user",
    "open_side": "YES",
    "stop_loss_cents": 40,
    "shares": 10
  }
]
```

Behavior:
- `open_side: YES` triggers when `current_yes_price <= stop_loss_cents`
- `open_side: NO` triggers when `current_no_price <= stop_loss_cents`
- On trigger, daemon submits opposite side to `/api/bet` to close.
