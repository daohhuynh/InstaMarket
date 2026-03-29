require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const personas = require("./personas.json");

const app = express();
app.use(cors()); // Crucial: Chrome Extensions will block requests without this
app.use(express.json());

// 1. Initialize Clients
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

function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timer),
  );
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

// Helper: Generate fake keywords from titles so the Extension's tweet matcher works
const generateKeywords = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 3);
};

// --- ENDPOINT: /api/markets ---
// Translates your Supabase 'markets' table into Person 3's MOCK_MARKETS shape
// --- ENDPOINT: /api/bet ---
// Handles the HUMAN user clicking "Bet YES" or "Bet NO" in the Chrome Extension
app.post("/api/bet", async (req, res) => {
  try {
    // Expected payload from Chrome Extension:
    // { walletAddress, marketId, side, shares, price }
    const { walletAddress, marketId, side, shares, price } = req.body;

    // 1. Find the internal user ID mapped to this Solana wallet
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("sol_wallet_address", walletAddress)
      .single();

    if (userErr || !user) throw new Error("User wallet not registered");

    // 2. Record the trade in the Supabase Ledger
    const { error: insertErr } = await supabase.from("positions").insert([
      {
        user_id: user.id,
        market_id: parseInt(marketId.replace(/\D/g, "")) || 1, // Strip 'm' from mock ids if present
        side: side,
        shares: shares,
        average_entry_price: price,
      },
    ]);

    if (insertErr) throw insertErr;

    // 3. (Optional for Demo) Actually burn mock USDC via Solana connection here
    // await splTokenTransfer(...)

    res.status(200).json({
      success: true,
      message: `Successfully bought ${shares} shares of ${side}`,
    });
  } catch (err) {
    console.error("Bet processing failed:", err);
    res.status(500).json({ error: "Failed to process bet" });
  }
});

// --- ENDPOINT: /api/save ---
// Handles the HUMAN user clicking the "Save for Later" bookmark icon
app.post("/api/save", async (req, res) => {
  try {
    const { walletAddress, marketId } = req.body;

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("sol_wallet_address", walletAddress)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: "User wallet not registered" });
    }

    const { error } = await supabase.from("saved_markets_timeseries").insert([
      {
        user_id: user.id,
        market_id: parseInt(marketId.replace(/\D/g, "")) || 1,
      },
    ]);

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save market" });
  }
});
// --- ENDPOINT: /api/portfolio ---
// Merges Supabase positions and Solana on-chain balance for Person 3's MOCK_PORTFOLIO
app.get("/api/portfolio/:walletAddress", async (req, res) => {
  try {
    const walletPubkey = new PublicKey(req.params.walletAddress);

    // 1. Get real SOL balance
    const balanceLamports = await solanaConnection.getBalance(walletPubkey);
    const solBalance = balanceLamports / 1e9;

    // 2. Get user's Postgres positions
    const { data: users } = await supabase
      .from("users")
      .select("id")
      .eq("sol_wallet_address", req.params.walletAddress)
      .single();
    let openPositions = [];

    if (users) {
      const { data: positions } = await supabase
        .from("positions")
        .select(
          `side, average_entry_price, shares, markets(title, current_yes_price)`,
        )
        .eq("user_id", users.id);

      openPositions = (positions || []).map((p) => {
        const currentPrice =
          p.side === "YES"
            ? p.markets.current_yes_price
            : 100 - p.markets.current_yes_price;
        const pnl = (currentPrice - p.average_entry_price) * p.shares;
        return {
          title: p.markets.title,
          side: p.side,
          stake: p.average_entry_price * p.shares,
          pnl: pnl,
          pnlPct:
            ((currentPrice - p.average_entry_price) / p.average_entry_price) *
            100,
          positive: pnl >= 0,
        };
      });
    }

    res.json({
      totalValue: solBalance * 150, // Mocking SOL to USD for demo
      dailyPnl: openPositions.reduce((sum, p) => sum + p.pnl, 0),
      positions: openPositions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// ── Nova Lite helpers ────────────────────────────────────────
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
      Math.max(1, parseInt(text.match(/SHARES:\s*(\d+)/i)?.[1]) || 5),
    );
    const confidence = Math.min(
      100,
      Math.max(1, parseInt(text.match(/CONFIDENCE:\s*(\d+)/i)?.[1]) || 50),
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
    return {
      id: persona.id,
      name: persona.name,
      type: persona.type,
      decision: "NO",
      shares: 5,
      confidence: 50,
      reasoning: "Could not parse response.",
    };
  }
}

async function submitToCLOB(decisions) {
  await Promise.allSettled(
    decisions.map((d) =>
      fetch("http://localhost:8080/api/paper-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: d.id,
          side: d.decision === "YES" ? 1 : 0,
          price: d.decision === "YES" ? d.confidence : 100 - d.confidence,
          quantity: d.shares,
        }),
      }),
    ),
  );
}

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
      return res
        .status(400)
        .json({ error: "tweetText and market are required" });
    }

    // Exactly one Bedrock call per persona; failures do not cancel sibling calls
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

    // Submit all orders to the C++ CLOB (non-blocking — don't fail if CLOB is down)
    submitToCLOB(decisions).catch((err) =>
      console.warn("[persona-sim] CLOB submission failed:", err.message),
    );

    // Aggregate results
    const yesAgents = decisions.filter((d) => d.decision === "YES");
    const noAgents = decisions.filter((d) => d.decision === "NO");
    const simulatedYesPct = Math.round(
      (yesAgents.length / decisions.length) * 100,
    );
    const simulatedNoPct = 100 - simulatedYesPct;
    const edge = simulatedYesPct - (market.yesOdds || 50);
    const edgeVsMarket = `${edge >= 0 ? "+" : ""}${edge}% YES vs current odds`;

    const topYes = [...yesAgents]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    const topNo = [...noAgents]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    res.json({
      totalAgents: decisions.length,
      simulatedYesPct,
      simulatedNoPct,
      realYesPct: market.yesOdds || 50,
      realNoPct: market.noOdds || 50,
      edgeVsMarket,
      decisions,
      topYes,
      topNo,
    });
  } catch (err) {
    console.error("[persona-sim] failed:", err);
    res.status(500).json({ error: "Simulation failed", detail: err.message });
  } finally {
    personaSimInFlight = false;
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(
    `🚀 InstaMarket Translation Bridge live on http://localhost:${PORT}`,
  );
});
