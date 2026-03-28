// ============================================================
// HARDCODED DATA — swap these out for live API calls
// See README.md for integration guide
// ============================================================

const MOCK_MARKETS = [
  {
    id: "m1",
    question: "Will OpenAI release GPT-5 before June 2026?",
    yesOdds: 67,
    noOdds: 33,
    volume: "$42M Vol",
    keywords: ["openai", "gpt-5", "gpt5", "ai", "artificial intelligence", "chatgpt"],
    relatedMarkets: ["m2", "m3"]
  },
  {
    id: "m2",
    question: "Will Elon Musk leave Tesla CEO role by end of 2026?",
    yesOdds: 22,
    noOdds: 78,
    volume: "$18M Vol",
    keywords: ["elon", "musk", "tesla", "ceo"],
    relatedMarkets: ["m1"]
  },
  {
    id: "m3",
    question: "Will TikTok be banned in the US by July 2026?",
    yesOdds: 54,
    noOdds: 46,
    volume: "$31M Vol",
    keywords: ["tiktok", "ban", "bytedance", "us ban"],
    relatedMarkets: ["m4"]
  },
  {
    id: "m4",
    question: "Will Bitcoin exceed $150K before December 2026?",
    yesOdds: 41,
    noOdds: 59,
    volume: "$89M Vol",
    keywords: ["bitcoin", "btc", "crypto", "150k"],
    relatedMarkets: ["m5"]
  },
  {
    id: "m5",
    question: "Will the Fed cut rates in Q2 2026?",
    yesOdds: 73,
    noOdds: 27,
    volume: "$55M Vol",
    keywords: ["fed", "federal reserve", "rates", "interest rates", "fomc"],
    relatedMarkets: []
  }
];

const MOCK_AGENTS = [
  {
    id: "reddit",
    source: "Reddit",
    iconClass: "reddit",
    iconLabel: "R",
    insight: "r/investing overwhelmingly bullish — top post: 'GPT-5 is already in closed beta per leaked memo'",
    reasoning: [
      { step: 1, text: "Searched r/OpenAI, r/investing, r/MachineLearning for past 72h" },
      { step: 2, text: "Found 3 high-upvote posts referencing closed beta invites" },
      { step: 3, text: "Cross-referenced usernames with known OpenAI employee accounts" },
      { step: 4, text: "Sentiment score: 0.81 positive. Confidence: Medium-High" }
    ]
  },
  {
    id: "x",
    source: "X / Twitter",
    iconClass: "x",
    iconLabel: "X",
    insight: "5 ex-OpenAI employees tweeted about a 'major announcement' this week",
    reasoning: [
      { step: 1, text: "Queried @OpenAI mentions and replies from verified accounts" },
      { step: 2, text: "Identified 5 accounts with prior OpenAI affiliation via LinkedIn cross-ref" },
      { step: 3, text: "Tweet clustering: announcement language spiked 3x vs 30-day avg" },
      { step: 4, text: "Could be GPT-5, o4, or new product — uncertainty flagged" }
    ]
  },
  {
    id: "youtube",
    source: "YouTube",
    iconClass: "youtube",
    iconLabel: "▶",
    insight: "3 AI channels posted 'GPT-5 launch date CONFIRMED' videos in last 48h — 4.2M combined views",
    reasoning: [
      { step: 1, text: "Searched top AI YouTube channels for GPT-5 content" },
      { step: 2, text: "Transcribed thumbnails + titles using vision model" },
      { step: 3, text: "Checked view velocity — unusually high for speculative content" },
      { step: 4, text: "Note: YouTube AI channels frequently over-hype. Discount 20%" }
    ]
  },
  {
    id: "news",
    source: "Google News",
    iconClass: "news",
    iconLabel: "N",
    insight: "The Information: OpenAI pushed internal deadline to May 2026 — still within YES resolution window",
    reasoning: [
      { step: 1, text: "Scraped Google News for 'GPT-5' from past 7 days" },
      { step: 2, text: "Found The Information paywalled article, extracted headline + lede" },
      { step: 3, text: "May 2026 deadline < June 2026 resolution date = YES still possible" },
      { step: 4, text: "Source reliability: The Information is high-credibility. Confidence: High" }
    ]
  },
  {
    id: "polymarket",
    source: "Polymarket Data",
    iconClass: "polymarket",
    iconLabel: "P",
    insight: "Smart money moved 67→72% YES in last 6h — unusual volume spike at 2 AM UTC",
    reasoning: [
      { step: 1, text: "Pulled order book data for this market from Polymarket API" },
      { step: 2, text: "Detected +$180K YES buys between 01:45–02:15 UTC" },
      { step: 3, text: "Wallet cluster analysis: 3 wallets with >80% win rate placed identical bets" },
      { step: 4, text: "Historical pattern: informed trading precedes announcements ~70% of the time" }
    ]
  },
  {
    id: "sentiment",
    source: "Sentiment Model",
    iconClass: "sentiment",
    iconLabel: "S",
    insight: "Cross-source sentiment: 71% bullish. Insider signal score: 8.2/10. Recommend YES.",
    reasoning: [
      { step: 1, text: "Aggregated signals from all 5 other agents" },
      { step: 2, text: "Weighted by source reliability: News > Polymarket data > Reddit > X > YouTube" },
      { step: 3, text: "Bayesian update: prior 67%, posterior 71% after insider signal" },
      { step: 4, text: "Final recommendation: YES at current odds offers +EV. Size: 3-5% of portfolio" }
    ]
  }
];

const MOCK_RISK = {
  resolution: { label: "Resolution Risk", value: 25, level: "low" },
  event: { label: "Event Risk", value: 55, level: "med" },
  liquidity: { label: "Liquidity Risk", value: 15, level: "low" }
};

const MOCK_RECOMMENDATION = {
  action: "Bet YES",
  market: "Will OpenAI release GPT-5 before June 2026?",
  size: "$150 (4% of portfolio)",
  hedge: "Consider $40 NO on 'GPT-5 by March 2026' as partial hedge",
  reasoning: "Smart money + insider signals align. Risk-adjusted EV: +18%. Recommend 4% position size with optional hedge."
};

const MOCK_PORTFOLIO = {
  totalValue: "$4,821.50",
  dailyPnl: "+$312.40",
  dailyPnlPct: "+6.9%",
  winRate: "71%",
  avgReturn: "+22%",
  positions: [
    { title: "Will OpenAI release GPT-5 before June 2026?", side: "YES", stake: "$150", pnl: "+$68.20", pnlPct: "+45%", positive: true },
    { title: "Will TikTok be banned in the US by July 2026?", side: "NO", stake: "$200", pnl: "+$44.00", pnlPct: "+22%", positive: true },
    { title: "Will Bitcoin exceed $150K before Dec 2026?", side: "YES", stake: "$300", pnl: "-$82.50", pnlPct: "-27%", positive: false },
    { title: "Will the Fed cut rates in Q2 2026?", side: "YES", stake: "$100", pnl: "+$31.00", pnlPct: "+31%", positive: true }
  ],
  history: [
    { title: "Will Trump win 2024 election?", side: "YES", stake: "$500", pnl: "+$430", date: "Nov 6 2024", positive: true },
    { title: "Will Nvidia hit $200 by end of 2024?", side: "YES", stake: "$250", pnl: "+$310", date: "Dec 12 2024", positive: true },
    { title: "Will SpaceX land on Mars by 2026?", side: "NO", stake: "$75", pnl: "+$45", date: "Jan 3 2025", positive: true },
    { title: "Will Apple release AR glasses in 2025?", side: "YES", stake: "$120", pnl: "-$120", date: "Feb 14 2025", positive: false }
  ]
};

const MOCK_SAVED = [
  {
    question: "Will Elon Musk leave Tesla CEO role by end of 2026?",
    savedAt: "Saved 3d ago",
    savedOdds: 18,
    currentOdds: 22,
    volume: "$18M Vol",
    delta: +4,
    favorable: true,
    side: "YES"
  },
  {
    question: "Will Bitcoin exceed $150K before December 2026?",
    savedAt: "Saved 1d ago",
    savedOdds: 48,
    currentOdds: 41,
    volume: "$89M Vol",
    delta: -7,
    favorable: false,
    side: "YES"
  },
  {
    question: "Will the Fed cut rates in Q2 2026?",
    savedAt: "Saved 5h ago",
    savedOdds: 70,
    currentOdds: 73,
    volume: "$55M Vol",
    delta: +3,
    favorable: true,
    side: "YES"
  }
];

const MOCK_PERSONAS = [
  {
    handle: "@cryptoskeptic",
    emoji: "🐻",
    portfolioSize: "$1,200",
    bet: "NO — $200",
    outcome: "Lost",
    won: false,
    reasoning: "Bet NO based on OpenAI's track record of delays. Missed the insider signal."
  },
  {
    handle: "@AIbullrun2026",
    emoji: "🚀",
    portfolioSize: "$4,800",
    bet: "YES — $500",
    outcome: "Won +$380",
    won: true,
    reasoning: "Strong conviction from leaked beta invites. Sized up correctly."
  },
  {
    handle: "@hedgequant99",
    emoji: "📊",
    portfolioSize: "$850",
    bet: "YES — $80",
    outcome: "Won +$61",
    won: true,
    reasoning: "Conservative sizing, still profitable. Risk-adjusted approach."
  }
];

const DITTO_PROFILES = [
  {
    name: "VegaTrader",
    emoji: "⚡",
    color: "#7c3aed",
    matchPct: 94,
    reason: "You both hold YES on OpenAI GPT-5 and NO on TikTok ban"
  },
  {
    name: "AlphaSeeker",
    emoji: "🎯",
    color: "#3b82f6",
    matchPct: 87,
    reason: "Matching positions on Fed rates and BTC $150K"
  },
  {
    name: "MarketWitch",
    emoji: "🔮",
    color: "#ec4899",
    matchPct: 79,
    reason: "Both bearish on Musk/Tesla and bullish on AI markets"
  }
];

// Payoff curve data points (x = price paid, y = payout)
const PAYOFF_CURVE_DATA = [
  {x: 0, y: 0}, {x: 10, y: 10}, {x: 20, y: 25}, {x: 30, y: 42},
  {x: 40, y: 60}, {x: 50, y: 80}, {x: 60, y: 105}, {x: 70, y: 135},
  {x: 80, y: 170}, {x: 90, y: 210}, {x: 100, y: 260}
];
