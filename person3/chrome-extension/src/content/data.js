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

// ============================================================
// OFFLINE TEXT PARSER — tweet -> closest existing market
// (No Bedrock / no API credits needed)
// ============================================================

const MATCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "if", "in", "is", "it", "its", "of", "on", "or", "that", "the",
  "their", "to", "was", "will", "with", "this", "these", "those", "you",
  "your", "they", "we", "our", "us", "about", "before", "after", "than",
  "into", "out", "up", "down", "over", "under", "just", "now",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"
]);

const POLYMARKET_MARKETS_ENDPOINT = "https://gamma-api.polymarket.com/markets";
const AI_MARKET_MATCH_ENDPOINT_DEFAULT = "http://localhost:8787/v1/match-market";
const AI_MARKET_MATCH_LIMIT_PER_LOAD = 5;

let MARKET_UNIVERSE = [...MOCK_MARKETS];
let MARKET_MATCH_INDEX = [];
let MARKET_TOKEN_DF = new Map();
let AI_MARKET_MATCH_USED = 0;
rebuildMarketMatchIndex();

function findBestMarketForTweet(tweetText) {
  const ranked = rankMarketCandidates(tweetText, 30);
  return selectParserMatchFromRanked(ranked);
}

async function findBestMarketForTweetWithAi(tweetText) {
  const ranked = rankMarketCandidates(tweetText, 25);
  const parserMatch = selectParserMatchFromRanked(ranked);

  if (!shouldUseAiRerank()) {
    return parserMatch;
  }
  if (!ranked.length) {
    return parserMatch;
  }

  const aiResult = await rerankWithAi(tweetText, ranked, parserMatch);
  if (!aiResult) {
    return parserMatch;
  }

  const aiMarket = getMarketById(aiResult.matched_market_id);
  if (!aiMarket) {
    return parserMatch;
  }

  const selectedCandidate = ranked.find(candidate => String(candidate.market.id) === String(aiMarket.id));
  const topParserScore = ranked[0]?.score || 0;
  const selectedScore = selectedCandidate?.score || 0;
  const hasStrongParserSupport = selectedScore >= 8 && selectedScore >= topParserScore * 0.55;
  if (!hasStrongParserSupport) {
    return parserMatch;
  }

  const parserTerms = parserMatch ? [...parserMatch.exactMatches, ...parserMatch.tokenMatches] : [];
  const aiTerms = Array.isArray(aiResult.key_terms) ? aiResult.key_terms : [];
  const tokenMatches = [...new Set([...parserTerms, ...aiTerms])];
  return {
    market: aiMarket,
    score: Number.isFinite(aiResult.confidence_score) ? Number(aiResult.confidence_score) : (parserMatch?.score ?? 0),
    confidence: clampNumber(Number(aiResult.confidence_score) || parserMatch?.confidence || 70, 1, 99),
    exactMatches: parserMatch?.exactMatches || [],
    tokenMatches,
    reasons: [
      "Bedrock reranked top parser candidates for this tweet.",
      typeof aiResult.rationale === "string" ? aiResult.rationale : "No rationale returned.",
    ],
    source: "aws-bedrock",
  };
}

function rankMarketCandidates(tweetText, limit = 30) {
  const normalizedText = normalizeForMatch(tweetText);
  if (!normalizedText) return [];

  const tweetTokens = tokenizeForMatch(normalizedText);
  const tokenSet = new Set(tweetTokens);
  if (tokenSet.size < 2) return [];

  const scored = MARKET_MATCH_INDEX.map(entry => scoreMarket(entry, normalizedText, tokenSet))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function selectParserMatchFromRanked(ranked) {
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;

  const distinctMatches = new Set([...best.exactMatches, ...best.tokenMatches]).size;
  const margin = best.score - (second?.score || 0);
  const hasStrongSingleSignal = distinctMatches === 1 && best.score >= 12 && margin >= 3;

  if (best.score < 8) return null;
  if (distinctMatches < 2 && !hasStrongSingleSignal) return null;
  if (margin < 1.5 && best.score < 14) return null;

  return {
    market: best.market,
    score: best.score,
    confidence: calculateMatchConfidence(best.score, margin, distinctMatches),
    exactMatches: best.exactMatches,
    tokenMatches: best.tokenMatches,
    reasons: best.reasons,
    source: "parser",
  };
}

function buildResearchSummary(tweetText, match) {
  const textPreview = String(tweetText || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const matchedTerms = [...new Set([...match.exactMatches, ...match.tokenMatches])].slice(0, 8);
  const method = match.source === "aws-bedrock" ? "Bedrock AI + parser rerank" : "Deterministic parser";

  return {
    createdAt: new Date().toISOString(),
    title: `Match for "${match.market.question}"`,
    method,
    confidence: match.confidence,
    matchedTerms,
    summary:
      match.source === "aws-bedrock"
        ? `Matched this tweet to "${match.market.question}" using Bedrock reranking over parser candidates.`
        : `Matched this tweet to "${match.market.question}" using deterministic keyword/token overlap.`,
    steps: [
      `Normalized tweet text and removed punctuation/URLs.`,
      `Scored overlap against ${MARKET_UNIVERSE.length} existing markets.`,
      `Top market score: ${match.score} (${match.confidence}% confidence).`,
      `Matched terms: ${matchedTerms.length ? matchedTerms.join(", ") : "none listed"}.`,
      ...((match.reasons || []).map(reason => `Reason: ${reason}`)),
      textPreview ? `Tweet snippet: "${textPreview}${textPreview.length >= 180 ? "..." : ""}"` : "Tweet snippet unavailable."
    ]
  };
}

function shouldUseAiRerank() {
  if (AI_MARKET_MATCH_USED >= AI_MARKET_MATCH_LIMIT_PER_LOAD) {
    return false;
  }
  AI_MARKET_MATCH_USED += 1;
  return true;
}

async function rerankWithAi(tweetText, rankedCandidates, parserMatch) {
  const endpoint = getAiMarketMatchEndpoint();
  if (!endpoint) {
    return null;
  }

  const payload = {
    tweet_text: String(tweetText || "").slice(0, 2500),
    parser_best_market_id: parserMatch?.market?.id ?? rankedCandidates[0]?.market?.id ?? null,
    parser_best_confidence: parserMatch?.confidence ?? 0,
    candidates: rankedCandidates.slice(0, 25).map(candidate => ({
      id: candidate.market.id,
      question: candidate.market.question,
      category: candidate.market.category || "",
      eventTitle: candidate.market.eventTitle || "",
      slug: candidate.market.slug || "",
      yesOdds: Number(candidate.market.yesOdds) || 0,
      noOdds: Number(candidate.market.noOdds) || 0,
      volume: candidate.market.volume || "",
      parser_score: Number(candidate.score) || 0,
    })),
  };

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data || typeof data !== "object") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function getAiMarketMatchEndpoint() {
  const fromStorage = safeReadLocalStorage("instamarket_ai_match_endpoint");
  const fromWindow =
    typeof window !== "undefined" && typeof window.INSTAMARKET_AI_MATCH_ENDPOINT === "string"
      ? window.INSTAMARKET_AI_MATCH_ENDPOINT
      : "";
  const endpoint = fromStorage || fromWindow || AI_MARKET_MATCH_ENDPOINT_DEFAULT;
  return normalizeEndpoint(endpoint);
}

function normalizeEndpoint(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const asUrl = new URL(trimmed);
    if (asUrl.protocol !== "http:" && asUrl.protocol !== "https:") return "";
    return asUrl.toString();
  } catch {
    return "";
  }
}

function safeReadLocalStorage(key) {
  try {
    if (typeof localStorage === "undefined") return "";
    const value = localStorage.getItem(key);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function scoreMarket(entry, normalizedText, tokenSet) {
  let score = 0;
  const exactMatches = [];
  const tokenMatches = [];
  const reasons = [];

  for (const phrase of entry.keywordPhrases) {
    if (!phrase) continue;
    if (normalizedText.includes(phrase)) {
      exactMatches.push(phrase);
      score += phrase.includes(" ") ? 6 : 4;
    }
  }

  for (const token of entry.allTokenSet) {
    if (tokenSet.has(token)) {
      tokenMatches.push(token);
      score += tokenWeight(token);
    }
  }

  const questionOverlap = entry.questionTokens.filter(token => tokenSet.has(token)).length;
  if (entry.questionTokens.length > 0) {
    const coverageRatio = questionOverlap / entry.questionTokens.length;
    score += coverageRatio * 8;
  }

  const distinctMatches = new Set([...exactMatches, ...tokenMatches]).size;
  if (distinctMatches > 1) {
    score += Math.min(5, distinctMatches);
  }

  if (exactMatches.length === 0 && distinctMatches <= 1) {
    score *= 0.35;
  }

  if (exactMatches.length > 0) {
    reasons.push(`Exact keyword phrases: ${exactMatches.join(", ")}`);
  }
  if (tokenMatches.length > 0) {
    reasons.push(`Token overlap: ${tokenMatches.join(", ")}`);
  }

  return {
    market: entry.market,
    score,
    exactMatches,
    tokenMatches,
    reasons
  };
}

function tokenWeight(token) {
  const df = MARKET_TOKEN_DF.get(token) || 1;
  return clampNumber(3.6 - Math.log2(df + 1), 0.45, 3.25);
}

function calculateMatchConfidence(score, margin, distinctMatches) {
  const cappedMargin = clampNumber(margin, 0, 5);
  const raw = 20 + score * 2.1 + cappedMargin * 5 + distinctMatches * 2;
  return Math.round(clampNumber(raw, 40, 97));
}

function rebuildMarketMatchIndex() {
  MARKET_MATCH_INDEX = buildMarketMatchIndex(MARKET_UNIVERSE);
  MARKET_TOKEN_DF = buildTokenDocumentFrequency(MARKET_MATCH_INDEX);
}

function buildMarketMatchIndex(markets) {
  return markets.map(market => {
    const keywordPhrases = buildKeywordPhrases(market);
    const questionTokens = tokenizeForMatch(market.question);
    const keywordTokens = keywordPhrases.flatMap(tokenizeForMatch);
    const allTokenSet = new Set([...questionTokens, ...keywordTokens]);

    return {
      market,
      questionTokens,
      keywordPhrases,
      allTokenSet
    };
  });
}

function buildTokenDocumentFrequency(index) {
  const df = new Map();
  for (const entry of index) {
    for (const token of entry.allTokenSet) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  return df;
}

function buildKeywordPhrases(market) {
  const base = [];

  if (Array.isArray(market.keywords)) {
    base.push(...market.keywords.map(normalizeForMatch).filter(Boolean));
  }

  if (market.eventTitle) {
    base.push(normalizeForMatch(market.eventTitle));
  }
  if (market.slug) {
    base.push(normalizeForMatch(String(market.slug).replace(/-/g, " ")));
  }
  if (market.question) {
    base.push(...extractQuestionPhrases(market.question));
  }

  return [...new Set(base)].slice(0, 24);
}

function extractQuestionPhrases(question) {
  const tokens = tokenizeForMatch(question).slice(0, 12);
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return phrases;
}

function setMarketUniverse(markets) {
  if (!Array.isArray(markets) || markets.length === 0) {
    return;
  }

  MARKET_UNIVERSE = markets
    .filter(market => market && typeof market.question === "string" && market.question.trim().length > 0)
    .map(market => ({
      ...market,
      id: String(market.id),
      question: String(market.question),
      yesOdds: Number.isFinite(Number(market.yesOdds)) ? Number(market.yesOdds) : 50,
      noOdds: Number.isFinite(Number(market.noOdds)) ? Number(market.noOdds) : 50,
      volume: typeof market.volume === "string" ? market.volume : "$0 Vol",
      keywords: Array.isArray(market.keywords) ? market.keywords.map(String) : [],
      relatedMarkets: Array.isArray(market.relatedMarkets) ? market.relatedMarkets.map(String) : [],
      category: typeof market.category === "string" ? market.category : "",
      slug: typeof market.slug === "string" ? market.slug : "",
      eventTitle: typeof market.eventTitle === "string" ? market.eventTitle : "",
      polymarketUrl: typeof market.polymarketUrl === "string" ? market.polymarketUrl : ""
    }));

  rebuildMarketMatchIndex();
}

function getMarketUniverse() {
  return MARKET_UNIVERSE;
}

function getMarketById(marketId) {
  return MARKET_UNIVERSE.find(market => String(market.id) === String(marketId)) || null;
}

async function loadPolymarketMarketUniverse(options = {}) {
  const limit = clampNumber(Number(options.limit) || 500, 50, 1200);
  const endpoint = `${POLYMARKET_MARKETS_ENDPOINT}?active=true&closed=false&limit=${Math.round(limit)}&order=volumeNum&ascending=false`;

  const response = await fetch(endpoint, { method: "GET", credentials: "omit", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Polymarket fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Polymarket payload is not an array.");
  }

  const mapped = payload
    .map(mapPolymarketMarket)
    .filter(Boolean);

  if (mapped.length < 25) {
    throw new Error("Polymarket returned too few markets.");
  }

  setMarketUniverse(mapped);
  return { source: "polymarket", count: mapped.length };
}

function mapPolymarketMarket(raw) {
  if (!raw || typeof raw !== "object") return null;

  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (!question) return null;

  const events = Array.isArray(raw.events) ? raw.events : [];
  const firstEvent = events[0] && typeof events[0] === "object" ? events[0] : null;
  const eventTitle = typeof firstEvent?.title === "string" ? firstEvent.title : "";
  const eventSlug = typeof firstEvent?.slug === "string" ? firstEvent.slug : "";
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const category = typeof raw.category === "string" ? raw.category : "";
  const urlSlug = eventSlug || slug;

  const odds = parseYesNoOdds(raw.outcomes, raw.outcomePrices);
  const volumeValue = Number(raw.volumeNum ?? raw.volume ?? raw.volume24hr ?? 0);

  return {
    id: String(raw.id ?? raw.conditionId ?? slug ?? question),
    question,
    yesOdds: odds.yesOdds,
    noOdds: odds.noOdds,
    volume: formatVolumeShort(volumeValue),
    keywords: buildSeedKeywords({ question, slug, category, eventTitle }),
    relatedMarkets: [],
    category,
    slug,
    eventTitle,
    polymarketUrl: urlSlug ? `https://polymarket.com/event/${urlSlug}` : "https://polymarket.com"
  };
}

function buildSeedKeywords({ question, slug, category, eventTitle }) {
  const seeds = [
    question,
    eventTitle,
    slug ? slug.replace(/-/g, " ") : "",
    category ? category.replace(/-/g, " ") : ""
  ]
    .map(normalizeForMatch)
    .filter(Boolean);

  const tokenSeeds = seeds.flatMap(tokenizeForMatch);
  return [...new Set([...seeds, ...tokenSeeds])].slice(0, 24);
}

function parseYesNoOdds(outcomesValue, pricesValue) {
  const outcomes = parseMaybeJsonArray(outcomesValue).map(value => String(value).toLowerCase());
  const prices = parseMaybeJsonArray(pricesValue).map(value => Number(value));

  const yesIndex = outcomes.findIndex(value => value === "yes");
  const noIndex = outcomes.findIndex(value => value === "no");

  let yesOdds = NaN;
  let noOdds = NaN;

  if (yesIndex >= 0 && Number.isFinite(prices[yesIndex])) {
    yesOdds = prices[yesIndex] * 100;
  }
  if (noIndex >= 0 && Number.isFinite(prices[noIndex])) {
    noOdds = prices[noIndex] * 100;
  }

  if (!Number.isFinite(yesOdds) && Number.isFinite(noOdds)) {
    yesOdds = 100 - noOdds;
  }
  if (!Number.isFinite(noOdds) && Number.isFinite(yesOdds)) {
    noOdds = 100 - yesOdds;
  }

  if (!Number.isFinite(yesOdds) || !Number.isFinite(noOdds)) {
    yesOdds = 50;
    noOdds = 50;
  }

  yesOdds = clampNumber(yesOdds, 1, 99);
  noOdds = clampNumber(noOdds, 1, 99);

  return {
    yesOdds: Math.round(yesOdds),
    noOdds: Math.round(noOdds)
  };
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function formatVolumeShort(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "$0 Vol";
  }
  if (numeric >= 1_000_000_000) {
    return `$${(numeric / 1_000_000_000).toFixed(1)}B Vol`;
  }
  if (numeric >= 1_000_000) {
    return `$${(numeric / 1_000_000).toFixed(1)}M Vol`;
  }
  if (numeric >= 1_000) {
    return `$${(numeric / 1_000).toFixed(1)}K Vol`;
  }
  return `$${Math.round(numeric)} Vol`;
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]/g, " ")
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForMatch(text) {
  return normalizeForMatch(text)
    .split(" ")
    .map(stemToken)
    .filter(token => token.length > 1 && !MATCH_STOP_WORDS.has(token) && !isPureNumberToken(token));
}

function stemToken(token) {
  if (token.endsWith("ies") && token.length > 4) {
    return token.slice(0, -3) + "y";
  }
  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function isPureNumberToken(token) {
  return /^\d+$/.test(token);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (typeof window !== "undefined") {
  window.loadPolymarketMarketUniverse = loadPolymarketMarketUniverse;
  window.getMarketUniverse = getMarketUniverse;
  window.getMarketById = getMarketById;
}
