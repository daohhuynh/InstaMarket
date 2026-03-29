import { config as loadDotEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv({ path: ".env.local", quiet: true });
loadDotEnv({ quiet: true });

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const BETS_API_ENDPOINT = (process.env.BETS_API_ENDPOINT || "http://localhost:3000/api/bet").trim();
const STOP_LOSS_TARGETS_FILE = (process.env.STOP_LOSS_TARGETS_FILE || "./stop_loss_targets.json").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** @typedef {{market_id:string,wallet_address:string,open_side:"YES"|"NO",stop_loss_cents:number,shares:number,triggered?:boolean}} StopLossTarget */

/** @type {StopLossTarget[]} */
const stopLossTargets = loadStopLossTargets(resolve(process.cwd(), STOP_LOSS_TARGETS_FILE));

const targetsByMarket = new Map();
for (const target of stopLossTargets) {
  const marketId = String(target.market_id);
  const list = targetsByMarket.get(marketId) || [];
  list.push(target);
  targetsByMarket.set(marketId, list);
}

console.log(`[RiskDaemon] Loaded ${stopLossTargets.length} stop-loss targets.`);

const channel = supabase
  .channel("market-price-daemon")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "markets" },
    (payload) => {
      handleMarketUpdate(payload.new).catch((error) => {
        console.error("[RiskDaemon] handleMarketUpdate error:", error);
      });
    },
  )
  .subscribe((status) => {
    console.log(`[RiskDaemon] Realtime status: ${status}`);
  });

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  console.log("[RiskDaemon] Shutting down...");
  await supabase.removeChannel(channel);
  process.exit(0);
}

async function handleMarketUpdate(nextMarket) {
  const marketId = String(nextMarket?.id ?? "");
  if (!marketId || !targetsByMarket.has(marketId)) {
    return;
  }

  const yesCents = normalizeToCents(nextMarket.current_yes_price);
  const noCents = 100 - yesCents;
  const targets = targetsByMarket.get(marketId) || [];

  for (const target of targets) {
    if (target.triggered) continue;
    const triggerHit =
      target.open_side === "YES"
        ? yesCents <= target.stop_loss_cents
        : noCents <= target.stop_loss_cents;
    if (!triggerHit) continue;

    target.triggered = true;
    const closeSide = target.open_side === "YES" ? "NO" : "YES";
    const closePrice = closeSide === "YES" ? yesCents : noCents;
    const payload = {
      walletAddress: target.wallet_address,
      marketId: marketId,
      side: closeSide,
      shares: target.shares,
      price: closePrice,
    };

    console.log(
      `[RiskDaemon] Triggered market=${marketId} wallet=${target.wallet_address} stop=${target.stop_loss_cents}c closeSide=${closeSide}`,
    );

    const response = await fetch(BETS_API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[RiskDaemon] Bet API failed (${response.status}): ${body.slice(0, 300)}`);
      target.triggered = false;
      continue;
    }

    console.log(`[RiskDaemon] Closed position for market ${marketId} at ${closePrice}c.`);
  }
}

function loadStopLossTargets(filePath) {
  if (!existsSync(filePath)) {
    console.warn(`[RiskDaemon] Stop-loss target file not found at ${filePath}. Starting with 0 targets.`);
    return [];
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("STOP_LOSS_TARGETS_FILE must be a JSON array.");
  }

  return parsed
    .map((item) => normalizeTarget(item))
    .filter((item) => Boolean(item));
}

function normalizeTarget(item) {
  if (!item || typeof item !== "object") return null;
  const marketId = String(item.market_id ?? "").trim();
  const walletAddress = String(item.wallet_address ?? "").trim();
  const openSide = item.open_side === "NO" ? "NO" : "YES";
  const stopLossCents = Number(item.stop_loss_cents);
  const shares = Number(item.shares ?? 0);

  if (!marketId || !walletAddress) return null;
  if (!Number.isFinite(stopLossCents) || stopLossCents <= 0 || stopLossCents >= 100) return null;
  if (!Number.isFinite(shares) || shares <= 0) return null;

  return {
    market_id: marketId,
    wallet_address: walletAddress,
    open_side: openSide,
    stop_loss_cents: Math.round(stopLossCents),
    shares: Number(shares.toFixed(4)),
    triggered: false,
  };
}

function normalizeToCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  if (numeric >= 0 && numeric <= 1) {
    return Math.max(0, Math.min(100, Math.round(numeric * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
