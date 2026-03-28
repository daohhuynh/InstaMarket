require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

const app = express();
app.use(cors()); // Crucial: Chrome Extensions will block requests without this
app.use(express.json());

// 1. Initialize Clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const solanaConnection = new Connection(process.env.SOLANA_RPC || 'http://127.0.0.1:8899', 'confirmed');

// Helper: Generate fake keywords from titles so the Extension's tweet matcher works
const generateKeywords = (title) => {
    return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3);
};

// --- ENDPOINT: /api/markets ---
// Translates your Supabase 'markets' table into Person 3's MOCK_MARKETS shape
app.get('/api/markets', async (req, res) => {
    try {
        const { data: markets, error } = await supabase.from('markets').select('*');
        if (error) throw error;

        const formattedMarkets = markets.map(m => ({
            id: m.id,
            question: m.title,
            yesOdds: m.current_yes_price,
            noOdds: 100 - m.current_yes_price,
            volume: parseFloat(m.liquidity),
            keywords: generateKeywords(m.title) 
        }));

        res.json(formattedMarkets);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch markets' });
    }
});

// --- ENDPOINT: /api/portfolio ---
// Merges Supabase positions and Solana on-chain balance for Person 3's MOCK_PORTFOLIO
app.get('/api/portfolio/:walletAddress', async (req, res) => {
    try {
        const walletPubkey = new PublicKey(req.params.walletAddress);
        
        // 1. Get real SOL balance
        const balanceLamports = await solanaConnection.getBalance(walletPubkey);
        const solBalance = balanceLamports / 1e9;

        // 2. Get user's Postgres positions
        const { data: users } = await supabase.from('users').select('id').eq('sol_wallet_address', req.params.walletAddress).single();
        let openPositions = [];
        
        if (users) {
            const { data: positions } = await supabase
                .from('positions')
                .select(`side, average_entry_price, shares, markets(title, current_yes_price)`)
                .eq('user_id', users.id);

            openPositions = (positions || []).map(p => {
                const currentPrice = p.side === 'YES' ? p.markets.current_yes_price : (100 - p.markets.current_yes_price);
                const pnl = (currentPrice - p.average_entry_price) * p.shares;
                return {
                    title: p.markets.title,
                    side: p.side,
                    stake: p.average_entry_price * p.shares,
                    pnl: pnl,
                    pnlPct: ((currentPrice - p.average_entry_price) / p.average_entry_price) * 100,
                    positive: pnl >= 0
                };
            });
        }

        res.json({
            totalValue: solBalance * 150, // Mocking SOL to USD for demo
            dailyPnl: openPositions.reduce((sum, p) => sum + p.pnl, 0),
            positions: openPositions
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 InstaMarket Translation Bridge live on http://localhost:${PORT}`);
});

