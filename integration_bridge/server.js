const path = require("path");
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Connection, PublicKey } = require("@solana/web3.js");

dotenv.config();
dotenv.config({
  path: path.resolve(__dirname, ".env.local"),
  override: false,
});
dotenv.config({
  path: path.resolve(__dirname, "../.env.local"),
  override: false,
});

const app = express();
app.use(cors()); // Crucial: Chrome Extensions will block requests without this
app.use(express.json());

const normalizeSupabaseUrl = (rawValue) => {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9-]+$/i.test(value)) return `https://${value}.supabase.co`;
  return null;
};

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase configuration for integration_bridge.");
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY in integration_bridge/.env.");
  console.error(
    "SUPABASE_URL can be either https://<project>.supabase.co or just <project-ref>.",
  );
  process.exit(1);
}

// 1. Initialize Clients
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const solanaConnection = new Connection(
  process.env.SOLANA_RPC || "http://127.0.0.1:8899",
  "confirmed",
);

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

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("sol_wallet_address", walletAddress)
      .single();

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

Based purely on your personality and how you think, make ONE trading decision. Use the record_decision tool to submit it.`;

  const command = new ConverseCommand({
    modelId: "amazon.nova-lite-v1:0",
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 400, temperature: 0.85 },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: "record_decision",
            description: "Records the persona's trading decision.",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  decision: { type: "string", enum: ["YES", "NO"] },
                  shares: { type: "integer", minimum: 1, maximum: 50 },
                  confidence: { type: "integer", minimum: 1, maximum: 100 },
                  reasoning: { type: "string" }
                },
                required: ["decision", "shares", "confidence", "reasoning"]
              }
            }
          }
        }
      ],
      // This strict instruction forces Bedrock to use the tool
      toolChoice: { tool: { name: "record_decision" } } 
    }
  });

  const response = await bedrockClient.send(command);
  
  // Extract the JSON tool use from the Bedrock response
  const toolBlock = response.output.message.content.find(c => c.toolUse);
  
  if (toolBlock && toolBlock.toolUse) {
    const result = toolBlock.toolUse.input;
    return {
      id: persona.id,
      name: persona.name,
      type: persona.type,
      // Fallbacks just in case the LLM ignores the bounds
      decision: result.decision === "YES" ? "YES" : "NO",
      shares: Math.min(50, Math.max(1, result.shares || 5)),
      confidence: Math.min(100, Math.max(1, result.confidence || 50)),
      reasoning: result.reasoning || "Used intuition.",
    };
  }
  
  throw new Error("LLM failed to use the required JSON tool.");
}

async function submitToCLOB(decisions, rawMarketId) {
  // FIX 2: Validate before hitting the C++ engine
  const marketId = parseMarketId(rawMarketId);
  if (!marketId) {
    console.warn("[persona-sim] Invalid market ID, skipping CLOB submission");
    return;
  }

  await Promise.allSettled(
    decisions.map((d) =>
      fetch("http://localhost:8080/api/paper-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_id: marketId,
          persona_id: d.id,
          side: d.decision === "YES" ? 0 : 1, 
          price: d.decision === "YES" ? d.confidence : 100 - d.confidence,
          quantity: d.shares,
        }),
      }),
    ),
  );
}

// --- ENDPOINT: /api/persona-sim ---
app.post("/api/persona-sim", async (req, res) => {
  const { tweetText, market } = req.body;
  
  if (!tweetText || !market || !market.id) {
    return res.status(400).json({ error: "tweetText and valid market object are required" });
  }

  // FIX 1: Lock only the specific market being simulated
  if (activeSims.has(market.id)) {
    return res.status(409).json({
      error: "A simulation is already running for this market.",
    });
  }
  
  activeSims.add(market.id);
  
  try {
    // Parallel Bedrock calls for 10 personas
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
      console.warn(`[persona-sim] ${persona.id} failed:`, result.reason?.message);
      return fallbackDecision(persona, result.reason?.message);
    });

    // Forward the AI decisions to your C++ Engine
    submitToCLOB(decisions, market.id).catch((err) =>
      console.warn("[persona-sim] CLOB submission failed:", err.message),
    );

    // Aggregate stats for the Extension UI
    const yesAgents = decisions.filter((d) => d.decision === "YES");
    const noAgents = decisions.filter((d) => d.decision === "NO");
    const simulatedYesPct = Math.round((yesAgents.length / decisions.length) * 100);
    const edge = simulatedYesPct - (market.yesOdds || 50);

    res.json({
      totalAgents: decisions.length,
      simulatedYesPct,
      simulatedNoPct: 100 - simulatedYesPct,
      realYesPct: market.yesOdds || 50,
      realNoPct: market.noOdds || 50,
      edgeVsMarket: `${edge >= 0 ? "+" : ""}${edge}% YES bias`,
      decisions,
      topYes: [...yesAgents].sort((a, b) => b.confidence - a.confidence).slice(0, 3),
      topNo: [...noAgents].sort((a, b) => b.confidence - a.confidence).slice(0, 3),
    });
  } catch (err) {
    console.error("[persona-sim] failed:", err);
    res.status(500).json({ error: "Simulation failed", detail: err.message });
  } finally {
    activeSims.delete(market.id);
  }
});

app.post("/api/resolve-market", async (req, res) => {
  const { marketId, winningSide } = req.body; // winningSide is "YES" or "NO"

  try {
    // 1. Tell the C++ Engine to freeze the book and resolve
    await fetch("http://localhost:8080/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        market_id: parseMarketId(marketId), 
        winning_side: winningSide === "YES" ? 0 : 1 
      })
    });

    // 2. Update the Human's Portfolio in Supabase
    const { data: positions } = await supabase
      .from("positions")
      .select("*")
      .eq("market_id", parseMarketId(marketId));

    let totalPayout = 0;
    
    if (positions) {
      for (const pos of positions) {
        // If they bet on the winning side, they get $1 per share.
        if (pos.side === winningSide) {
           totalPayout += (pos.shares * 1.00); 
        }
      }
    }

    // (Optional) Update human's USDC balance in DB or via Solana here

    res.json({ 
      success: true, 
      message: `Market ${marketId} resolved to ${winningSide}.`,
      human_payout: totalPayout
    });
  } catch (err) {
    console.error("Failed to resolve market:", err);
    res.status(500).json({ error: "Resolution failed" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(
    `🚀 InstaMarket Translation Bridge live on http://localhost:${PORT}`,
  );
});