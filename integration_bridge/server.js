require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const personas = require("./personas.json");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);
const solanaConnection = new Connection(
  process.env.SOLANA_RPC || "http://127.0.0.1:8899",
  "confirmed",
);
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const NOVA_LITE_TIMEOUT_MS = Number(process.env.NOVA_LITE_TIMEOUT_MS) || 45_000;
let personaSimInFlight = false;
const EXTENSION_SYNC_STATE = new Map();
const DASHBOARD_DIST_DIR = path.resolve(__dirname, "..", "instamarket-dashboard", "dist");

function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function fallbackDecision(persona, reason) {
  return {
    id: persona.id,
    name: persona.name,
    type: persona.type,
    decision: "NO",
    shares: 5,
    confidence: 50,
    reasoning: reason || "Model call failed or timed out.",
  };
}

async function lookupUserId(walletAddress) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id")
    .eq("sol_wallet_address", walletAddress)
    .single();
  if (error || !user?.id) {
    return null;
  }
  return user.id;
}

app.post("/api/bet", async (req, res) => {
  try {
    const { walletAddress, marketId, side, shares, price } = req.body;
    const userId = await lookupUserId(walletAddress);
    if (!userId) throw new Error("User wallet not registered");

    const { error: insertErr } = await supabase.from("positions").insert([
      {
        user_id: userId,
        market_id: parseInt(String(marketId).replace(/\D/g, ""), 10) || 1,
        side,
        shares,
        average_entry_price: price,
      },
    ]);

    if (insertErr) throw insertErr;

    res.status(200).json({
      success: true,
      message: `Successfully bought ${shares} shares of ${side}`,
    });
  } catch (err) {
    console.error("Bet processing failed:", err);
    res.status(500).json({ error: "Failed to process bet" });
  }
});

app.post("/api/save", async (req, res) => {
  try {
    const { walletAddress, marketId } = req.body;
    const userId = await lookupUserId(walletAddress);
    if (!userId) {
      return res.status(404).json({ error: "User wallet not registered" });
    }

    const { error } = await supabase.from("saved_markets_timeseries").insert([
      {
        user_id: userId,
        market_id: parseInt(String(marketId).replace(/\D/g, ""), 10) || 1,
      },
    ]);

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Save processing failed:", err);
    res.status(500).json({ error: "Failed to save market" });
  }
});

app.get("/api/portfolio/:walletAddress", async (req, res) => {
  try {
    const walletAddress = String(req.params.walletAddress || "").trim();
    const walletPubkey = new PublicKey(walletAddress);
    const balanceLamports = await solanaConnection.getBalance(walletPubkey);
    const solBalance = balanceLamports / 1e9;

    const userId = await lookupUserId(walletAddress);
    let openPositions = [];

    if (userId) {
      const { data: positions } = await supabase
        .from("positions")
        .select("side, average_entry_price, shares, markets(title, current_yes_price)")
        .eq("user_id", userId);

      openPositions = (positions || []).map((p) => {
        const currentPrice =
          p.side === "YES"
            ? Number(p.markets?.current_yes_price) || 0
            : 100 - (Number(p.markets?.current_yes_price) || 0);
        const averageEntry = Number(p.average_entry_price) || 0;
        const shareCount = Number(p.shares) || 0;
        const pnl = (currentPrice - averageEntry) * shareCount;
        return {
          title: p.markets?.title || "Unknown market",
          side: p.side,
          stake: averageEntry * shareCount,
          pnl,
          pnlPct: averageEntry ? ((currentPrice - averageEntry) / averageEntry) * 100 : 0,
          positive: pnl >= 0,
        };
      });
    }

    res.json({
      totalValue: solBalance * 150,
      dailyPnl: openPositions.reduce((sum, p) => sum + p.pnl, 0),
      positions: openPositions,
    });
  } catch (err) {
    console.error("Portfolio fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

app.post("/api/sidebar-state-sync", async (req, res) => {
  try {
    const walletAddress = String(req.body?.walletAddress || "").trim();
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    EXTENSION_SYNC_STATE.set(walletAddress, {
      recentBets: Array.isArray(req.body?.recentBets) ? req.body.recentBets : [],
      savedMarkets: Array.isArray(req.body?.savedMarkets) ? req.body.savedMarkets : [],
      syncedAt: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("sidebar-state-sync failed:", err);
    res.status(500).json({ error: "Failed to sync sidebar state" });
  }
});

app.get("/api/dashboard-state/:walletAddress", async (req, res) => {
  try {
    const walletAddress = String(req.params.walletAddress || "").trim();
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    let totalValue = 0;
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const balanceLamports = await solanaConnection.getBalance(walletPubkey);
      totalValue = (balanceLamports / 1e9) * 150;
    } catch {
      totalValue = 0;
    }

    const extensionState = EXTENSION_SYNC_STATE.get(walletAddress) || {
      recentBets: [],
      savedMarkets: [],
    };

    const userId = await lookupUserId(walletAddress);
    let normalizedPositions = [];
    let savedMarkets = [];

    if (userId) {
      const { data: positions } = await supabase
        .from("positions")
        .select("market_id, side, shares, average_entry_price, created_at, markets(title, current_yes_price)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      normalizedPositions = (positions || []).map((entry) => {
        const currentYesOdds = Number(entry?.markets?.current_yes_price) || 0;
        const currentPrice = entry.side === "YES" ? currentYesOdds : 100 - currentYesOdds;
        const stake = (Number(entry.average_entry_price) || 0) * (Number(entry.shares) || 0);
        const pnl = (currentPrice - (Number(entry.average_entry_price) || 0)) * (Number(entry.shares) || 0);
        return {
          marketId: String(entry.market_id || ""),
          question: entry?.markets?.title || "Unknown market",
          side: entry.side === "NO" ? "NO" : "YES",
          amount: Math.max(0, Math.round(stake)),
          placedAt: entry.created_at || new Date().toISOString(),
          yesOdds: currentYesOdds,
          noOdds: 100 - currentYesOdds,
          currentYesOdds,
          currentNoOdds: 100 - currentYesOdds,
          pnl,
        };
      });

      const { data: savedRows } = await supabase
        .from("saved_markets_timeseries")
        .select("market_id, created_at, markets(title, current_yes_price, volume)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      const savedSeen = new Set();
      for (const row of savedRows || []) {
        const marketId = String(row.market_id || "");
        if (!marketId || savedSeen.has(marketId)) continue;
        savedSeen.add(marketId);
        const currentYesOdds = Number(row?.markets?.current_yes_price) || 0;
        savedMarkets.push({
          marketId,
          question: row?.markets?.title || "Unknown market",
          savedAt: row.created_at || new Date().toISOString(),
          savedYesOdds: currentYesOdds,
          savedNoOdds: 100 - currentYesOdds,
          currentYesOdds,
          currentNoOdds: 100 - currentYesOdds,
          savedVolume: row?.markets?.volume || "$0 Vol",
          currentVolume: row?.markets?.volume || "$0 Vol",
        });
      }
    }

    const mergedBetsMap = new Map();
    for (const entry of [...normalizedPositions, ...(Array.isArray(extensionState.recentBets) ? extensionState.recentBets : [])]) {
      if (!entry) continue;
      const key = `${entry.marketId || entry.question}-${entry.placedAt || ""}-${entry.side || ""}`;
      if (!mergedBetsMap.has(key)) {
        mergedBetsMap.set(key, {
          marketId: String(entry.marketId || ""),
          question: entry.question || "Unknown market",
          side: entry.side === "NO" ? "NO" : "YES",
          amount: Number(entry.amount || 0),
          placedAt: entry.placedAt || new Date().toISOString(),
          yesOdds: Number(entry.yesOdds || entry.currentYesOdds || 0),
          noOdds: Number(entry.noOdds || entry.currentNoOdds || 0),
          currentYesOdds: Number(entry.currentYesOdds || entry.yesOdds || 0),
          currentNoOdds: Number(entry.currentNoOdds || entry.noOdds || 0),
          pnl: Number(entry.pnl || 0),
        });
      }
    }

    const mergedSavedMap = new Map();
    for (const entry of [...savedMarkets, ...(Array.isArray(extensionState.savedMarkets) ? extensionState.savedMarkets : [])]) {
      if (!entry) continue;
      const marketId = String(entry.marketId || "");
      if (!marketId || mergedSavedMap.has(marketId)) continue;
      mergedSavedMap.set(marketId, {
        marketId,
        question: entry.question || "Unknown market",
        savedAt: entry.savedAt || new Date().toISOString(),
        savedYesOdds: Number(entry.savedYesOdds || 0),
        savedNoOdds: Number(entry.savedNoOdds || 0),
        currentYesOdds: Number(entry.currentYesOdds || entry.savedYesOdds || 0),
        currentNoOdds: Number(entry.currentNoOdds || entry.savedNoOdds || 0),
        savedVolume: entry.savedVolume || "$0 Vol",
        currentVolume: entry.currentVolume || entry.savedVolume || "$0 Vol",
      });
    }

    const mergedRecentBets = [...mergedBetsMap.values()]
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
      .slice(0, 12);
    const mergedSavedMarkets = [...mergedSavedMap.values()]
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    const yesBets = mergedRecentBets.filter((entry) => entry.side === "YES").length;
    const noBets = mergedRecentBets.filter((entry) => entry.side === "NO").length;
    const marketCount = new Set(mergedRecentBets.map((entry) => entry.marketId)).size;
    const dailyPnl = mergedRecentBets.reduce((sum, entry) => sum + Number(entry.pnl || 0), 0);

    res.json({
      walletAddress,
      portfolio: {
        totalValue,
        dailyPnl,
        betCount: mergedRecentBets.length,
        yesBets,
        noBets,
        marketCount,
        recentBets: mergedRecentBets,
      },
      savedMarkets: mergedSavedMarkets,
    });
  } catch (err) {
    console.error("dashboard-state failed:", err);
    res.status(500).json({ error: "Failed to fetch dashboard state" });
  }
});

async function callNovaLite(persona, tweetText, market) {
  const prompt = `You are ${persona.name} (${persona.type}).
Personality: ${persona.personality}
Portfolio: $${persona.portfolio_size} | Risk tolerance: ${persona.risk_tolerance}/1.0

You are evaluating this prediction market:
Tweet that triggered it: "${tweetText}"
Market question: "${market.question}"
Current market odds: YES ${market.yesOdds}% | NO ${market.noOdds}%

Based purely on your personality and how you think, make ONE trading decision.
Respond in exactly this format with no extra text:
DECISION: YES or NO
SHARES: (integer between 1 and 50, sized to your risk tolerance and conviction)
CONFIDENCE: (integer 1-100, how confident you are)
REASONING: (one sentence, in your voice)`;

  const command = new ConverseCommand({
    modelId: "amazon.nova-lite-v1:0",
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 120, temperature: 0.85 },
  });

  const response = await bedrockClient.send(command);
  const text = response.output.message.content[0].text;
  return parseNovaResponse(text, persona);
}

function parseNovaResponse(text, persona) {
  try {
    const decision =
      text.match(/DECISION:\s*(YES|NO)/i)?.[1]?.toUpperCase() || "NO";
    const shares = Math.min(
      50,
      Math.max(1, parseInt(text.match(/SHARES:\s*(\d+)/i)?.[1], 10) || 5),
    );
    const confidence = Math.min(
      100,
      Math.max(1, parseInt(text.match(/CONFIDENCE:\s*(\d+)/i)?.[1], 10) || 50),
    );
    const reasoning =
      text.match(/REASONING:\s*(.+)/i)?.[1]?.trim() || "No reasoning provided.";
    return {
      id: persona.id,
      name: persona.name,
      type: persona.type,
      decision,
      shares,
      confidence,
      reasoning,
    };
  } catch {
    return fallbackDecision(persona, "Could not parse response.");
  }
}

async function submitToCLOB(decisions) {
  await Promise.allSettled(
    decisions.map((d) =>
      fetch("http://localhost:8080/api/paper-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_id: 1,
          persona_id: d.id,
          side: d.decision === "YES" ? 1 : 0,
          price: d.decision === "YES" ? d.confidence : 100 - d.confidence,
          quantity: d.shares,
        }),
      }),
    ),
  );
}

app.get("/api/orderbook/:marketId", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const marketId = parseInt(req.params.marketId, 10);
    if (isNaN(marketId)) {
      return res.status(400).json({ error: "Invalid market ID", yes: [], no: [] });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(
      `http://localhost:8080/api/orderbook?market_id=${marketId}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) {
      return res.json({ yes: [], no: [], error: "CLOB returned non-OK status" });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.warn("Orderbook fetch error (non-fatal):", err.message);
    res.json({ yes: [], no: [] });
  }
});

// --- ENDPOINT: /api/persona-sim ---
// Runs one Nova Lite call per persona (10 total) per request; parallel with per-call timeouts.
app.post("/api/persona-sim", async (req, res) => {
  if (personaSimInFlight) {
    return res.status(409).json({
      error: "A simulation is already running. Wait for it to finish before starting another.",
    });
  }
  personaSimInFlight = true;
  try {
    const { tweetText, market } = req.body;
    if (!tweetText || !market) {
      return res.status(400).json({ error: "tweetText and market are required" });
    }

    const settled = await Promise.allSettled(
      personas.map((persona) =>
        withTimeout(
          callNovaLite(persona, tweetText, market),
          NOVA_LITE_TIMEOUT_MS,
          `persona ${persona.id}`,
        ),
      ),
    );

    const decisions = settled.map((result, index) => {
      const persona = personas[index];
      if (result.status === "fulfilled") {
        return result.value;
      }
      console.warn(
        `[persona-sim] ${persona.id} (${persona.name}):`,
        result.reason?.message || result.reason,
      );
      return fallbackDecision(
        persona,
        result.reason?.message
          ? `Error: ${result.reason.message}`
          : "Model call failed or timed out.",
      );
    });

    submitToCLOB(decisions).catch((err) =>
      console.warn("[persona-sim] CLOB submission failed:", err.message),
    );

    const yesAgents = decisions.filter((d) => d.decision === "YES");
    const noAgents = decisions.filter((d) => d.decision === "NO");
    const simulatedYesPct = Math.round((yesAgents.length / decisions.length) * 100);
    const simulatedNoPct = 100 - simulatedYesPct;
    const edge = simulatedYesPct - (market.yesOdds || 50);
    const edgeVsMarket = `${edge >= 0 ? "+" : ""}${edge}% YES vs current odds`;

    res.json({
      totalAgents: decisions.length,
      simulatedYesPct,
      simulatedNoPct,
      realYesPct: market.yesOdds || 50,
      realNoPct: market.noOdds || 50,
      edgeVsMarket,
      decisions,
      topYes: [...yesAgents].sort((a, b) => b.confidence - a.confidence).slice(0, 3),
      topNo: [...noAgents].sort((a, b) => b.confidence - a.confidence).slice(0, 3),
    });
  } catch (err) {
    console.error("[persona-sim] failed:", err);
    res.status(500).json({ error: "Simulation failed", detail: err.message });
  } finally {
    personaSimInFlight = false;
  }
});

app.use("/dashboard", express.static(DASHBOARD_DIST_DIR));
app.get(/^\/dashboard(?:\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(DASHBOARD_DIST_DIR, "index.html"), (error) => {
    if (!error) return;
    res
      .status(error.statusCode || 500)
      .send("Dashboard build not available. Run npm run build in instamarket-dashboard.");
  });
});
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`InstaMarket Translation Bridge live on http://localhost:${PORT}`);
});
