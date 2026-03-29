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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(
    `🚀 InstaMarket Translation Bridge live on http://localhost:${PORT}`,
  );
});
