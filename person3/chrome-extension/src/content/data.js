// ============================================================
// LIVE DATA LAYER (NO MOCK MARKETS)
// ============================================================

// ============================================================
// TEXT PARSER — tweet -> closest existing market
// (Optional Bedrock rerank for first few tweets, parser-only otherwise)
// ============================================================

const MATCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "if", "in", "is", "it", "its", "of", "on", "or", "that", "the",
  "their", "to", "was", "will", "with", "this", "these", "those", "you",
  "your", "they", "we", "our", "us", "about", "before", "after", "than",
  "into", "out", "up", "down", "over", "under", "just", "now", "can", "only",
  "more", "most", "few", "many", "much", "very", "also", "really", "still",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "today", "yesterday", "tomorrow", "week", "month", "year", "day", "night",
  "hour", "hours", "ago", "view", "views", "analytics",
  "post", "tweet", "thread", "reply", "context", "reader", "people", "person",
  "news", "story", "update", "market", "odds", "bet", "yes", "no", "true", "false",
  "email", "gmail", "http", "https", "www", "com",
  "official", "officially", "challenge", "group", "private", "like", "comment", "follow", "following",
  "someone", "thing", "things", "hey", "just", "really", "very", "much",
  "get", "got", "make", "made", "using", "used", "use", "turn", "turned"
]);

const STEMMED_MATCH_STOP_WORDS = new Set([...MATCH_STOP_WORDS].map(stemTokenCore));
const SEARCH_QUERY_STOP_WORDS = new Set(MATCH_STOP_WORDS);

const TOKEN_CANONICAL_MAP = new Map([
  ["gpt-5", "gpt5"],
  ["gpt5", "gpt5"],
  ["chatgpt", "openai"],
  ["claudeai", "anthropic"],
  ["gemini", "google"],
  ["grok", "xai"],
  ["googleai", "google"],
  ["googleaistudio", "google"],
  ["claude", "anthropic"],
  ["anthropic", "anthropic"],
  ["btc", "bitcoin"],
  ["bitcoin", "bitcoin"],
  ["stx", "stacks"],
  ["stacksbtc", "bitcoin"],
  ["stacks.btc", "bitcoin"],
  ["eth", "ethereum"],
  ["ethereum", "ethereum"],
  ["fomc", "federalreserve"],
  ["fed", "federalreserve"],
  ["federal", "federalreserve"],
  ["reserve", "federalreserve"],
  ["tiktok", "tiktok"],
  ["bytedance", "tiktok"],
  ["xai", "xai"],
  ["google", "google"],
  ["openai", "openai"],
  ["ios", "ios"],
  ["iphone", "iphone"],
  ["ipad", "ipad"],
  ["macos", "macos"],
  ["xcode", "xcode"],
  ["apple", "apple"],
  ["stripe", "stripe"],
  ["gamestop", "gamestop"],
  ["gme", "gamestop"],
  ["twitch", "twitch"],
  ["spy", "sp500"],
  ["qqq", "nasdaq"],
  ["spx", "sp500"],
  ["snp", "sp500"],
  ["tesla", "tesla"],
  ["musk", "musk"],
  ["elon", "musk"],
  ["trump", "trump"],
]);

const STRICT_ENTITY_TOKENS = new Set([
  ...new Set(TOKEN_CANONICAL_MAP.values()),
  "crypto",
  "ai",
  "google",
  "election",
  "poll",
  "robot",
  "humanoid",
  "robotic",
  "unitree",
  "optimus",
  "inflation",
  "economy",
  "unemployment",
  "spacex",
  "netflix",
  "nvidia",
  "apple",
  "stripe",
  "gamestop",
  "twitch",
  "sp500",
  "nasdaq",
  "dow",
  "stocks",
  "ios",
  "iphone",
  "ipad",
  "xcode",
  "macos",
  "visionpro",
  "canada",
  "russia",
  "ukraine",
  "china",
  "claude",
  "gemini",
  "grok",
  "polymarket",
  "binance",
  "stacks"
]);

const DOMAIN_ANCHOR_TOKENS = new Set([
  "crypto", "bitcoin", "ethereum", "stacks", "ai", "openai", "anthropic", "gpt5", "chatgpt", "google", "gemini", "grok", "xai",
  "robot", "humanoid", "robotic", "unitree", "optimus", "tesla", "spacex",
  "fed", "federalreserve", "inflation", "economy", "unemployment", "sp500", "nasdaq", "dow", "stocks",
  "trump", "biden", "election", "senate", "president",
  "nvidia", "apple", "netflix", "stripe", "gamestop", "twitch",
  "ios", "iphone", "ipad", "xcode", "macos", "visionpro"
]);

const LOW_SIGNAL_MATCH_TOKENS = new Set([
  "launch",
  "app",
  "apps",
  "build",
  "built",
  "code",
  "coding",
  "idea",
  "ideas",
  "tool",
  "tools",
  "startup",
  "saas",
  "ship",
  "shipped",
  "product",
  "products",
  "generate",
  "generated",
  "generator",
  "official",
  "officially",
  "challenge",
  "group",
  "private",
  "added",
  "like",
  "comment",
  "follow",
  "following",
  "request",
  "requests",
  "feed",
  "resharing",
  "creative",
  "builder",
  "builders",
  "someone",
  "thing",
  "things",
  "hey",
  "get",
  "got",
  "make",
  "made",
  "use",
  "used",
  "using",
  "turn",
  "turned",
  "who",
  "everyone",
  "online",
  "weekend",
  "today",
  "tonight",
  "afternoon",
  "morning"
]);

const NOISY_MEDIA_HINT_TOKENS = new Set([
  "media",
  "image",
  "video",
  "thumb",
  "thumbnail",
  "format",
  "name",
  "small",
  "medium",
  "large",
  "orig",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "m3u8",
  "pbs",
  "twimg",
  "ext",
  "tweet",
  "amplify",
  "card",
  "status",
  "photo"
]);

const DOMAIN_GROUPS = [
  {
    name: "crypto",
    tweetTokens: [
      "crypto", "bitcoin", "ethereum", "btc", "eth", "binance", "solana", "clob",
      "polymarket", "arbitrage", "staking", "yield", "chain", "spread", "liquidity",
      "latency", "orderbook", "bid", "ask", "dex", "defi", "swap", "stacks", "stx", "onchain"
    ],
    marketTokens: [
      "crypto", "bitcoin", "ethereum", "btc", "eth", "solana", "binance",
      "polymarket", "arbitrage", "staking", "liquidity", "stacks", "stx", "onchain"
    ]
  },
  {
    name: "ai",
    tweetTokens: ["ai", "openai", "anthropic", "claude", "claudeai", "chatgpt", "gpt5", "grok", "xai", "gemini", "google", "googleaistudio", "robot", "humanoid", "robotic", "unitree", "optimus", "g1", "automation", "nvidia"],
    marketTokens: ["ai", "openai", "anthropic", "claude", "chatgpt", "gpt5", "grok", "xai", "gemini", "google", "optimus", "tesla", "robot", "humanoid", "robotic", "unitree", "nvidia", "technology", "tech"]
  },
  {
    name: "politics",
    tweetTokens: ["trump", "biden", "election", "senate", "house", "president", "campaign", "poll"],
    marketTokens: ["trump", "biden", "election", "senate", "house", "president", "campaign", "politics", "government", "world"]
  },
  {
    name: "macro",
    tweetTokens: ["fed", "federalreserve", "inflation", "economy", "unemployment", "gdp", "recession", "spy", "sp500", "nasdaq", "dow", "stocks", "equity", "index", "stripe", "payment", "payments", "fintech", "gamestop", "gme"],
    marketTokens: ["fed", "federalreserve", "rate", "inflation", "economy", "unemployment", "gdp", "recession", "economics", "finance", "macro", "sp500", "nasdaq", "dow", "stocks", "equity", "index", "stripe", "payment", "payments", "fintech", "gamestop", "gme"]
  },
  {
    name: "space",
    tweetTokens: ["spacex", "nasa", "rocket", "satellite", "mars", "artemis"],
    marketTokens: ["spacex", "nasa", "launch", "rocket", "satellite", "mars"]
  },
  {
    name: "apple-tech",
    tweetTokens: ["apple", "ios", "iphone", "ipad", "macos", "xcode", "vision", "visionpro", "airpods", "siri"],
    marketTokens: ["apple", "ios", "iphone", "ipad", "macos", "xcode", "vision", "visionpro", "siri", "technology", "tech"]
  }
];

const POLYMARKET_MARKETS_ENDPOINT = "https://gamma-api.polymarket.com/markets";
const POLYMARKET_EVENTS_ENDPOINT = "https://gamma-api.polymarket.com/events";
const POLYMARKET_PUBLIC_SEARCH_ENDPOINT = "https://gamma-api.polymarket.com/public-search";
const AI_MARKET_MATCH_ENDPOINT_DEFAULT = "http://localhost:8787/v1/match-market";
const AI_MARKET_QUERY_ENDPOINT_DEFAULT = "http://localhost:8787/v1/extract-market-query";
const AI_MARKET_MATCH_LIMIT_PER_LOAD = 14;
const AI_SEARCH_QUERY_LIMIT_PER_LOAD = 12;
const AI_MARKET_MATCH_MEDIA_LIMIT_PER_LOAD = 24;
const AI_SEARCH_QUERY_MEDIA_LIMIT_PER_LOAD = 20;
const EXTENSION_JSON_FETCH_MESSAGE = "IM_FETCH_JSON";
const DEFAULT_FETCH_TIMEOUT_MS = 4500;
const MIN_MARKETS_REQUIRED = 25;
const STRONG_MATCH_MIN_SCORE = 12;
const WEAK_MATCH_MIN_SCORE = 9.5;
const MIN_QUESTION_TOKEN_OVERLAP = 1;
const MIN_HIGH_SIGNAL_QUESTION_OVERLAP = 1;
const RARE_TOKEN_DF_RATIO = 0.035;
const VERY_RARE_TOKEN_DF_RATIO = 0.015;
const MAX_EXPANDED_MARKET_LIMIT = 9000;
const MAX_EXPANDED_MARKET_PAGES = 20;
const MARKET_UNIVERSE_CACHE_KEY = "instamarket_market_universe_cache_v1";
const MARKET_UNIVERSE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MARKET_UNIVERSE_CACHE_MAX_ITEMS = 2400;
const PAGE_FETCH_RETRIES = 2;
const PUBLIC_SEARCH_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const TWEET_MATCH_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const PUBLIC_SEARCH_MAX_EVENTS = 8;
const PUBLIC_SEARCH_MAX_MARKETS = 220;
const PUBLIC_SEARCH_MAX_QUERIES = 3;
const PUBLIC_SEARCH_MAX_MERGED_MARKETS = 45;
const PUBLIC_SEARCH_MIN_SCORE = 6.5;
const MIN_CONFIDENCE_TO_RENDER = 46;
const AI_REJECT_PARSER_FALLBACK_CONFIDENCE = 90;
const AI_REJECT_PARSER_FALLBACK_SCORE = 15;
const DOMAIN_ALIGNMENT_STRONG_CONFIDENCE = 88;
const DOMAIN_ALIGNMENT_STRONG_SCORE = 16;

const DOMAIN_HINT_QUERY_MAP = [
  {
    tokens: ["crypto", "bitcoin", "ethereum", "btc", "eth", "binance", "solana", "clob", "polymarket", "arbitrage", "chain", "spread", "liquidity", "orderbook", "latency", "stacks", "stx"],
    query: "bitcoin crypto polymarket"
  },
  {
    tokens: ["polymarket", "arbitrage", "staking", "yield", "chain", "spread", "liquidity", "clob", "orderbook", "bid", "ask", "latency", "dex", "defi"],
    query: "polymarket arbitrage staking yield"
  },
  {
    tokens: ["staking", "yield", "native", "apy", "defi", "liquidity", "vault", "restaking", "btc", "bitcoin"],
    query: "bitcoin staking yield"
  },
  {
    tokens: ["openai", "anthropic", "claude", "claudeai", "chatgpt", "gpt", "ai", "xai", "grok", "gemini", "google", "googleaistudio"],
    query: "openai anthropic claude ai"
  },
  {
    tokens: ["robot", "robotics", "unitree", "optimus", "automation", "factory"],
    query: "robotics tesla optimus ai"
  },
  {
    tokens: ["unitree", "humanoid", "robot", "g1", "hospital", "hospitals", "bedside", "medical"],
    query: "unitree g1 humanoid robot"
  },
  {
    tokens: ["fed", "federalreserve", "inflation", "unemployment", "recession", "gdp", "economy"],
    query: "fed rates inflation economy"
  },
  {
    tokens: ["spy", "sp500", "nasdaq", "dow", "stocks", "equity", "index", "qqq"],
    query: "s&p 500 nasdaq stocks"
  },
  {
    tokens: ["stripe", "payment", "payments", "fintech", "merchant", "checkout"],
    query: "stripe fintech ipo"
  },
  {
    tokens: ["trump", "biden", "election", "senate", "house", "president", "campaign"],
    query: "election trump biden"
  },
  {
    tokens: ["spacex", "nasa", "rocket", "launch", "satellite", "mars"],
    query: "spacex nasa launch"
  },
  {
    tokens: ["apple", "ios", "iphone", "ipad", "macos", "xcode", "visionpro", "siri"],
    query: "apple iphone ios xcode"
  }
];

const SUBSTRING_ENTITY_ANCHORS = [
  ...new Set([...STRICT_ENTITY_TOKENS, ...DOMAIN_ANCHOR_TOKENS])
]
  .filter(token => token.length >= 4 && !LOW_SIGNAL_MATCH_TOKENS.has(token));

const DOMAIN_SIGNAL_ENTITY_TOKENS = new Set([
  ...DOMAIN_ANCHOR_TOKENS,
  "arbitrage",
  "staking",
  "yield",
  "chain",
  "spread",
  "liquidity",
  "orderbook",
  "latency",
  "clob",
  "bid",
  "ask",
  "defi",
  "dex",
  "swap",
  "polymarket",
  "stacks",
  "stx",
  "onchain",
  "humanoid",
  "g1",
]);

const ROBOTICS_SIGNAL_TOKENS = new Set([
  "robot",
  "robotic",
  "humanoid",
  "unitree",
  "optimus",
  "g1",
]);

let MARKET_UNIVERSE = [];
let MARKET_MATCH_INDEX = [];
let MARKET_TOKEN_DF = new Map();
let MARKET_MATCH_INDEX_BY_ID = new Map();
let AI_MARKET_MATCH_USED = 0;
let AI_SEARCH_QUERY_USED = 0;
let AI_MARKET_MATCH_MEDIA_USED = 0;
let AI_SEARCH_QUERY_MEDIA_USED = 0;
let EXTENDED_MARKET_UNIVERSE_PROMISE = null;
let EXTENDED_MARKET_UNIVERSE_DONE = false;
let PUBLIC_SEARCH_CACHE = new Map();
let SEARCH_DEBUG_BY_TWEET = new Map();
let TWEET_MATCH_CACHE = new Map();
rebuildMarketMatchIndex();

function findBestMarketForTweet(tweetText, mediaAssets = []) {
  const mediaHintText = buildMediaHintText(mediaAssets);
  const combinedText = mediaHintText ? `${tweetText}\n${mediaHintText}` : tweetText;
  const ranked = rankMarketCandidates(combinedText, 30);
  return selectParserMatchFromRanked(ranked, tweetText);
}

async function findBestMarketForTweetWithAi(tweetText, mediaAssets = []) {
  const normalizedMediaAssets = normalizeMediaAssetsForApi(mediaAssets);
  const cacheKey = buildTweetMatchCacheKey(tweetText, normalizedMediaAssets);
  const cached = readTweetMatchCache(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const cacheAndReturn = (value) => {
    writeTweetMatchCache(cacheKey, value ?? null);
    return value ?? null;
  };

  // Gate: classify tweet signal strength before doing any work
  const signalLevel = classifyTweetSignalLevel(tweetText, normalizedMediaAssets);
  if (signalLevel === 0) return cacheAndReturn(null);

  const mediaHintText = buildMediaHintText(normalizedMediaAssets);
  const combinedText = mediaHintText ? `${tweetText}\n${mediaHintText}` : tweetText;

  let ranked = rankMarketCandidates(combinedText, 25);
  let parserMatch = selectParserMatchFromRanked(ranked, tweetText);
  parserMatch = enforceMatchAlignment(parserMatch, tweetText);
  if (!parserMatch) {
    parserMatch = buildRoboticsFallbackMatch(ranked, tweetText);
  }

  // Level 1 (domain signal, no specific named entities): allow search to expand
  // the candidate pool but skip AI rerank to preserve budget for level 2 tweets.
  if (signalLevel === 1) {
    const searchCandidate = await findBestMarketViaPublicSearch(tweetText, normalizedMediaAssets);
    if (searchCandidate?.ranked?.length) {
      ranked = mergeCandidateRankings(searchCandidate.ranked, ranked, 25);
      const alignedSearchMatch = enforceMatchAlignment(searchCandidate.match, tweetText);
      if (isSearchMatchPreferred(alignedSearchMatch, parserMatch)) {
        parserMatch = alignedSearchMatch
          ? { ...alignedSearchMatch, source: "polymarket-search" }
          : parserMatch;
      }
    }
    if (!parserMatch) return cacheAndReturn(null);
    return cacheAndReturn({
      ...parserMatch,
      confidence: Math.min(parserMatch.confidence, 70)
    });
  }

  const searchCandidate = await findBestMarketViaPublicSearch(tweetText, normalizedMediaAssets);
  if (searchCandidate?.ranked?.length) {
    ranked = mergeCandidateRankings(searchCandidate.ranked, ranked, 25);
    const alignedSearchMatch = enforceMatchAlignment(searchCandidate.match, tweetText);
    if (isSearchMatchPreferred(alignedSearchMatch, parserMatch)) {
      parserMatch = {
        ...alignedSearchMatch,
        source: "polymarket-search"
      };
    }
  }

  // Entity overlap filter: when tweet has specific entities, require candidates
  // to share at least one before sending the pool to the AI reranker.
  const tweetEntitiesForFilter = new Set(
    deriveQuerySignalEntities(tweetText, normalizedMediaAssets, { includeCryptoFallbackAsset: false })
      .filter(token => token.length >= 3)
      .filter(token => !LOW_SIGNAL_MATCH_TOKENS.has(token))
  );
  if (tweetEntitiesForFilter.size > 0) {
    const filtered = ranked.filter(c => {
      const mTokens = buildMarketSignalTokenSet(c.market);
      return [...tweetEntitiesForFilter].some(e => mTokens.has(e));
    });
    if (filtered.length > 0) {
      ranked = filtered.map((item, index) => ({ ...item, rank: index + 1 }));
    }
  }

  const hasHighConfidenceParser =
    parserMatch &&
    parserMatch.source !== "robotics-fallback" &&
    Number(parserMatch.confidence) >= 78 &&
    Number(parserMatch.score) >= 14;
  if (hasHighConfidenceParser) {
    return cacheAndReturn(parserMatch);
  }

  if (!parserMatch && shouldAttemptExpandedMarketLoad()) {
    await ensureExpandedMarketUniverseLoaded();
    ranked = rankMarketCandidates(combinedText, 25);
    parserMatch = selectParserMatchFromRanked(ranked, tweetText);
    parserMatch = enforceMatchAlignment(parserMatch, tweetText);
    if (!parserMatch) {
      parserMatch = buildRoboticsFallbackMatch(ranked, tweetText);
    }
  }

  if (!ranked.length) {
    return cacheAndReturn(null);
  }

  // When parser cannot pick a winner, still allow AI rerank for high-signal tweets.
  if (!parserMatch) {
    const allowAiWithoutParser = signalLevel >= 2 || normalizedMediaAssets.length > 0;
    if (!allowAiWithoutParser || !shouldUseAiRerank(normalizedMediaAssets)) {
      return cacheAndReturn(null);
    }

    const aiResult = await rerankWithAi(tweetText, ranked, null, normalizedMediaAssets);
    if (!aiResult || aiResult.should_show === false) {
      return cacheAndReturn(null);
    }

    const aiMarket = getMarketById(aiResult.matched_market_id);
    if (!aiMarket) {
      return cacheAndReturn(null);
    }

    const selectedCandidate = ranked.find(candidate => String(candidate.market.id) === String(aiMarket.id));
    const selectedScore = Number(selectedCandidate?.score) || 0;
    const topParserScore = Number(ranked[0]?.score) || 0;
    const aiConfidence = Number(aiResult.confidence_score) || 0;
    const hasSufficientSupport =
      selectedScore >= 4 ||
      (aiConfidence >= 86 && selectedScore >= 2 && topParserScore > 0 && selectedScore >= topParserScore * 0.35);
    if (!hasSufficientSupport) {
      return cacheAndReturn(null);
    }

    return cacheAndReturn({
      market: aiMarket,
      score: Number.isFinite(aiResult.confidence_score) ? Number(aiResult.confidence_score) : selectedScore,
      confidence: clampNumber(Number(aiResult.confidence_score) || 70, 1, 99),
      exactMatches: [],
      tokenMatches: Array.isArray(aiResult.key_terms) ? aiResult.key_terms.slice(0, 10) : [],
      reasons: [
        normalizedMediaAssets.length > 0
          ? "Bedrock selected market using media-aware reranking."
          : "Bedrock selected market from high-signal parser candidates.",
        typeof aiResult.rationale === "string" ? aiResult.rationale : "No rationale returned.",
      ],
      source: "aws-bedrock",
    });
  }

  if (!shouldUseAiRerank(normalizedMediaAssets)) {
    return cacheAndReturn(parserMatch);
  }

  const aiResult = await rerankWithAi(tweetText, ranked, parserMatch, normalizedMediaAssets);
  if (!aiResult) {
    return cacheAndReturn(parserMatch);
  }
  if (aiResult.should_show === false) {
    const keepParserFallback =
      (
        Number(parserMatch.confidence) >= AI_REJECT_PARSER_FALLBACK_CONFIDENCE &&
        Number(parserMatch.score) >= AI_REJECT_PARSER_FALLBACK_SCORE
      ) ||
      (
        parserMatch?.source === "robotics-fallback" &&
        Number(parserMatch.score) >= 6
      );
    return cacheAndReturn(keepParserFallback ? parserMatch : null);
  }

  const aiMarket = getMarketById(aiResult.matched_market_id);
  if (!aiMarket) {
    return cacheAndReturn(parserMatch);
  }

  const selectedCandidate = ranked.find(candidate => String(candidate.market.id) === String(aiMarket.id));
  const topParserScore = ranked[0]?.score || 0;
  const selectedScore = selectedCandidate?.score || 0;
  const aiConfidence = Number(aiResult.confidence_score) || 0;
  const hasStrongParserSupport = selectedScore >= 8 && selectedScore >= topParserScore * 0.55;
  const hasStrongAiSupport = aiConfidence >= 78 && selectedScore >= 5 && selectedScore >= topParserScore * 0.45;
  if (!hasStrongParserSupport && !hasStrongAiSupport) {
    return cacheAndReturn(parserMatch);
  }

  const parserTerms = parserMatch ? [...parserMatch.exactMatches, ...parserMatch.tokenMatches] : [];
  const aiTerms = Array.isArray(aiResult.key_terms) ? aiResult.key_terms : [];
  const tokenMatches = [...new Set([...parserTerms, ...aiTerms])];
  const aiMatch = {
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
  return cacheAndReturn(enforceMatchAlignment(aiMatch, tweetText) || parserMatch);
}

async function findBestMarketViaPublicSearch(tweetText, mediaAssets = []) {
  const searchMarkets = await fetchPublicSearchMarketsForTweet(tweetText, mediaAssets);
  if (!Array.isArray(searchMarkets) || searchMarkets.length === 0) {
    return null;
  }

  const ranked = rankCandidatesFromMarkets(searchMarkets, tweetText, 25);
  if (!ranked.length) {
    return null;
  }

  if (ranked[0].score >= PUBLIC_SEARCH_MIN_SCORE) {
    const match = selectParserMatchFromRanked(ranked, tweetText);
    if (match && match.confidence >= MIN_CONFIDENCE_TO_RENDER) {
      return {
        match,
        ranked
      };
    }
  }

  // Return ranked candidates for AI reranking even when parser can't pick a winner,
  // but do NOT fall back to low-precision domain/topic matches.
  return { match: null, ranked };
}

function isSearchMatchPreferred(searchMatch, parserMatch) {
  if (!searchMatch) return false;
  if (!parserMatch) return true;
  if (searchMatch.confidence >= parserMatch.confidence + 5) return true;
  if (searchMatch.score >= parserMatch.score + 1.5) return true;

  const searchTerms = new Set([...(searchMatch.exactMatches || []), ...(searchMatch.tokenMatches || [])]);
  const parserTerms = new Set([...(parserMatch.exactMatches || []), ...(parserMatch.tokenMatches || [])]);
  if (searchTerms.size >= parserTerms.size + 2 && searchMatch.confidence >= parserMatch.confidence) {
    return true;
  }
  return false;
}

function mergeCandidateRankings(primary = [], secondary = [], limit = 25) {
  const byId = new Map();
  const append = list => {
    for (const candidate of list) {
      if (!candidate?.market?.id) continue;
      const key = String(candidate.market.id);
      const existing = byId.get(key);
      if (!existing || (Number(candidate.score) || 0) > (Number(existing.score) || 0)) {
        byId.set(key, candidate);
      }
    }
  };

  append(primary);
  append(secondary);

  return [...byId.values()]
    .sort((left, right) => (Number(right.score) || 0) - (Number(left.score) || 0))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function setIntersects(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function buildTweetDebugKey(tweetText) {
  const normalized = normalizeForMatch(tweetText);
  return normalized.slice(0, 220);
}

function saveTweetSearchDebug(tweetText, debugPayload) {
  const key = buildTweetDebugKey(tweetText);
  if (!key) return;
  SEARCH_DEBUG_BY_TWEET.set(key, {
    savedAt: Date.now(),
    ...debugPayload
  });
  if (SEARCH_DEBUG_BY_TWEET.size > 160) {
    const entries = [...SEARCH_DEBUG_BY_TWEET.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt);
    for (let index = 0; index < entries.length - 120; index += 1) {
      SEARCH_DEBUG_BY_TWEET.delete(entries[index][0]);
    }
  }
}

function getTweetSearchDebug(tweetText) {
  const key = buildTweetDebugKey(tweetText);
  if (!key) return null;
  const debug = SEARCH_DEBUG_BY_TWEET.get(key);
  if (!debug) return null;
  return {
    queries: Array.isArray(debug.queries) ? debug.queries.slice(0, 10) : [],
    merged_count: Number(debug.merged_count) || 0,
    top_market_questions: Array.isArray(debug.top_market_questions) ? debug.top_market_questions.slice(0, 6) : [],
    used_ai_query_enhancer: Boolean(debug.used_ai_query_enhancer),
    retried_zero_hits: Boolean(debug.retried_zero_hits),
  };
}

function buildMediaCacheSignature(mediaAssets = []) {
  return (Array.isArray(mediaAssets) ? mediaAssets : [])
    .slice(0, 3)
    .map(asset => {
      const type = String(asset?.type || "");
      const url = normalizeForMatch(String(asset?.url || "").slice(0, 180));
      const poster = normalizeForMatch(String(asset?.poster_url || "").slice(0, 180));
      const alt = normalizeForMatch(String(asset?.alt_text || "").slice(0, 80));
      return `${type}:${url}|${poster}|${alt}`;
    })
    .join("||");
}

function buildTweetMatchCacheKey(tweetText, mediaAssets = []) {
  const textKey = buildTweetDebugKey(tweetText);
  if (!textKey) return "";
  const mediaKey = buildMediaCacheSignature(mediaAssets);
  return `${textKey}::${mediaKey}`;
}

function readTweetMatchCache(cacheKey) {
  if (!cacheKey) return undefined;
  const cached = TWEET_MATCH_CACHE.get(cacheKey);
  if (!cached) return undefined;
  if (Date.now() - cached.savedAt > TWEET_MATCH_CACHE_MAX_AGE_MS) {
    TWEET_MATCH_CACHE.delete(cacheKey);
    return undefined;
  }
  return cached.value;
}

function writeTweetMatchCache(cacheKey, value) {
  if (!cacheKey) return;
  TWEET_MATCH_CACHE.set(cacheKey, {
    savedAt: Date.now(),
    value: value ?? null
  });
  if (TWEET_MATCH_CACHE.size <= 220) return;
  const entries = [...TWEET_MATCH_CACHE.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt);
  for (let index = 0; index < entries.length - 180; index += 1) {
    TWEET_MATCH_CACHE.delete(entries[index][0]);
  }
}

function normalizeMediaAssetsForApi(mediaAssets) {
  if (!Array.isArray(mediaAssets)) return [];

  const assets = [];
  const seen = new Set();

  for (const raw of mediaAssets) {
    if (!raw || typeof raw !== "object") continue;
    const type = raw.type === "video" ? "video" : raw.type === "image" ? "image" : "";
    if (!type) continue;

    const url = normalizeEndpoint(String(raw.url || ""));
    const posterUrl = normalizeEndpoint(String(raw.poster_url || ""));
    const allowedUrl = isLikelyTweetMediaUrl(url) ? url : "";
    const allowedPosterUrl = isLikelyTweetMediaUrl(posterUrl) ? posterUrl : "";
    const altText = String(raw.alt_text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!allowedUrl && !allowedPosterUrl && !altText) continue;

    const key = `${type}|${allowedUrl}|${allowedPosterUrl}|${altText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    assets.push({
      type,
      url: allowedUrl,
      poster_url: allowedPosterUrl,
      alt_text: altText
    });
    if (assets.length >= 8) break;
  }

  return assets;
}

function isLikelyTweetMediaUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.pathname || "").toLowerCase();
    if (!host) return false;

    if (host.endsWith("pbs.twimg.com")) {
      if (path.includes("/profile_images/") || path.includes("/profile_banners/") || path.includes("/emoji/")) {
        return false;
      }
      if (
        path.includes("/media/") ||
        path.includes("/ext_tw_video_thumb/") ||
        path.includes("/amplify_video_thumb/") ||
        path.includes("/tweet_video_thumb/") ||
        path.includes("/card_img/")
      ) {
        return true;
      }
      return false;
    }

    if (host.endsWith("x.com") || host.endsWith("twitter.com") || host === "t.co") {
      return path.includes("/photo/") || path.includes("/video/") || path.includes("/status/");
    }

    // External media/card URLs are acceptable.
    return true;
  } catch {
    return false;
  }
}

function buildMediaHintText(mediaAssets) {
  const hints = extractMediaHintTokens(mediaAssets);
  if (!hints.length) return "";
  return `media hints: ${hints.join(" ")}`;
}

function extractMediaHintTokens(mediaAssets) {
  if (!Array.isArray(mediaAssets) || mediaAssets.length === 0) {
    return [];
  }

  const mediaText = mediaAssets
    .flatMap(asset => {
      const parts = [];
      if (asset.alt_text) {
        parts.push(asset.alt_text);
      }

      for (const key of ["url", "poster_url"]) {
        const value = asset[key];
        if (!value) continue;
        try {
          const parsed = new URL(String(value));
          const host = String(parsed.hostname || "").toLowerCase();
          // X CDN/media URLs are usually opaque hashes and degrade query quality.
          if (
            host.endsWith("pbs.twimg.com") ||
            host.endsWith("x.com") ||
            host.endsWith("twitter.com") ||
            host === "t.co"
          ) {
            continue;
          }
          const pathBits = parsed.pathname.split(/[\/_.-]/g).filter(Boolean);
          parts.push(pathBits.join(" "));
        } catch {
          // ignore malformed media URLs
        }
      }
      return parts;
    })
    .join(" ");

  return [...new Set(tokenizeForSearchQuery(mediaText))]
    .filter(token => token.length >= 3 && !LOW_SIGNAL_MATCH_TOKENS.has(token) && !isNoisyMediaHintToken(token))
    .slice(0, 20);
}

function isNoisyMediaHintToken(token) {
  if (!token) return true;
  const normalized = String(token).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return true;
  if (NOISY_MEDIA_HINT_TOKENS.has(normalized)) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (normalized.length >= 10 && /[a-z]/.test(normalized) && /\d/.test(normalized)) return true;
  return false;
}

function getDomainGroupsFromTweetTokens(tweetTokens) {
  const tokenSet = new Set(Array.isArray(tweetTokens) ? tweetTokens : []);
  const groups = new Set();

  for (const group of DOMAIN_GROUPS) {
    if (group.tweetTokens.some(token => {
      const normalized = stemToken(token);
      if (LOW_SIGNAL_MATCH_TOKENS.has(normalized)) return false;
      return tokenSet.has(normalized);
    })) {
      groups.add(group.name);
    }
  }

  return groups;
}

function deriveDomainHintsFromContent(tweetText, mediaAssets = []) {
  const hints = new Set();
  const tweetTokens = tokenizeForMatch(tweetText);
  for (const group of getDomainGroupsFromTweetTokens(tweetTokens)) {
    hints.add(group);
  }

  const mediaTokens = extractMediaHintTokens(mediaAssets).map(stemToken);
  for (const group of getDomainGroupsFromTweetTokens(mediaTokens)) {
    hints.add(group);
  }

  const normalized = normalizeForMatch(tweetText);
  if (/\b(ios|iphone|ipad|xcode|macos|vision\s*pro|apple)\b/.test(normalized)) {
    hints.add("apple-tech");
  }
  if (/\b(spy|sp500|s&p|nasdaq|qqq|dow)\b/.test(normalized)) {
    hints.add("macro");
  }

  return hints;
}

function extractHandleHashTokens(tweetText) {
  const raw = String(tweetText || "");
  const matches = raw.match(/[@#$][A-Za-z0-9_]{2,32}/g) || [];
  const tokens = [];
  for (const handle of matches) {
    const cleaned = handle.replace(/^[@#$]+/, "").replace(/_/g, " ");
    tokens.push(...tokenizeForSearchQuery(cleaned));
    tokens.push(...tokenizeForMatch(cleaned));
  }
  return uniquePreserveOrder(tokens).slice(0, 16);
}

function extractSearchAnchorTokens(tweetText, mediaAssets = []) {
  const matchTokens = tokenizeForMatch(tweetText);
  const searchTokens = tokenizeForSearchQuery(tweetText);
  const mediaTokens = extractMediaHintTokens(mediaAssets);
  const handleHashTokens = extractHandleHashTokens(tweetText);
  const strictEntities = extractStrictEntitySignals(matchTokens);

  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  const anchors = new Set(strictEntities);
  const sourceTokens = uniquePreserveOrder([
    ...searchTokens,
    ...handleHashTokens,
    ...mediaTokens
  ]);

  for (const rawToken of sourceTokens) {
    const token = stemToken(rawToken);
    if (!token || token.length < 3) continue;
    if (LOW_SIGNAL_MATCH_TOKENS.has(token)) continue;

    const df = MARKET_TOKEN_DF.get(token);
    const ratio = Number.isFinite(df) ? (df / marketCount) : 0;
    const hasDigit = /\d/.test(token);
    const rareEnough = Number.isFinite(df) && ratio <= 0.05;

    if (rareEnough || hasDigit) {
      anchors.add(token);
    }

    for (const anchor of SUBSTRING_ENTITY_ANCHORS) {
      if (token !== anchor && token.includes(anchor)) {
        anchors.add(anchor);
      }
    }
  }

  return [...anchors].slice(0, 12);
}

function deriveQuerySignalEntities(tweetText, mediaAssets = [], options = {}) {
  const tweetTokens = tokenizeForMatch(tweetText);
  const strictEntities = extractStrictEntitySignals(tweetTokens);
  if (strictEntities.length > 0) {
    return strictEntities.slice(0, 12);
  }

  const mediaTokens = extractMediaHintTokens(mediaAssets).map(stemToken);
  const merged = uniquePreserveOrder([...tweetTokens, ...mediaTokens]);
  const derived = merged
    .filter(token => DOMAIN_SIGNAL_ENTITY_TOKENS.has(token))
    .slice(0, 10);

  const hasCryptoDomain = (
    merged.some(token => ["crypto", "bitcoin", "btc", "eth", "ethereum", "polymarket", "defi", "dex", "clob", "chain"].includes(token)) ||
    merged.some(token => ["staking", "yield", "apy", "native", "restaking", "liquidity", "spread", "orderbook", "latency", "arbitrage"].includes(token))
  );
  const hasAssetEntity = derived.some(token => ["bitcoin", "btc", "ethereum", "eth", "solana", "sol"].includes(token));
  const includeCryptoFallbackAsset = options.includeCryptoFallbackAsset !== false;
  if (includeCryptoFallbackAsset && hasCryptoDomain && !hasAssetEntity) {
    derived.unshift("bitcoin");
  }

  return uniquePreserveOrder(derived).slice(0, 12);
}

function queryContainsAnchor(queryTokens, requiredAnchors) {
  if (!requiredAnchors || requiredAnchors.size === 0) return true;
  for (const token of queryTokens) {
    if (requiredAnchors.has(token)) return true;
    for (const anchor of requiredAnchors) {
      if (token !== anchor && token.includes(anchor)) {
        return true;
      }
    }
  }
  return false;
}

function buildMarketSignalTokenSet(market) {
  const source = [
    market?.question || "",
    market?.category || "",
    market?.eventTitle || "",
    market?.slug || "",
    market?.ticker || "",
    Array.isArray(market?.eventTags) ? market.eventTags.join(" ") : ""
  ].join(" ");
  return new Set(tokenizeForMatch(source));
}

function getDomainGroupsFromMarket(market) {
  const tokenSet = buildMarketSignalTokenSet(market);
  const groups = new Set();

  for (const group of DOMAIN_GROUPS) {
    if (group.marketTokens.some(token => tokenSet.has(stemToken(token)))) {
      groups.add(group.name);
    }
  }

  return groups;
}

function enforceMatchAlignment(match, tweetText = "") {
  if (!match?.market) return null;

  const tweetTokens = tokenizeForMatch(tweetText);
  if (tweetTokens.length === 0) {
    return match;
  }

  const strictEntities = extractStrictEntitySignals(tweetTokens);
  const marketTokenSet = buildMarketSignalTokenSet(match.market);
  const strictOverlap = strictEntities.filter(token => marketTokenSet.has(token)).length;
  const tweetDomainGroups = getDomainGroupsFromTweetTokens(tweetTokens);
  const marketDomainGroups = getDomainGroupsFromMarket(match.market);
  const hasDomainOverlap = tweetDomainGroups.size === 0 || setIntersects(tweetDomainGroups, marketDomainGroups);

  const confidence = Number(match.confidence) || 0;
  const score = Number(match.score) || 0;
  const hasStrongEvidence =
    confidence >= DOMAIN_ALIGNMENT_STRONG_CONFIDENCE &&
    score >= DOMAIN_ALIGNMENT_STRONG_SCORE;

  if (strictEntities.length > 0 && strictOverlap === 0 && !hasDomainOverlap && !hasStrongEvidence) {
    return null;
  }
  if (tweetDomainGroups.size > 0 && !hasDomainOverlap && !hasStrongEvidence) {
    return null;
  }

  return match;
}

function buildRoboticsFallbackMatch(rankedCandidates, tweetText = "") {
  if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
    return null;
  }

  const tweetTokens = tokenizeForMatch(tweetText);
  const strictEntities = extractStrictEntitySignals(tweetTokens);
  const hasRoboticsTweetSignal =
    strictEntities.some(token => ROBOTICS_SIGNAL_TOKENS.has(token)) ||
    tweetTokens.some(token => ROBOTICS_SIGNAL_TOKENS.has(token));
  if (!hasRoboticsTweetSignal) {
    return null;
  }

  for (const candidate of rankedCandidates.slice(0, 15)) {
    if (!candidate?.market) continue;
    const marketTokenSet = buildMarketSignalTokenSet(candidate.market);
    const hasRoboticsMarketSignal = [...ROBOTICS_SIGNAL_TOKENS].some(token => marketTokenSet.has(token));
    if (!hasRoboticsMarketSignal) continue;

    const score = Number(candidate.score) || 0;
    const questionOverlap = Number(candidate.questionTokenOverlap) || 0;
    const tokenMatches = Array.isArray(candidate.tokenMatches) ? candidate.tokenMatches : [];
    const roboticsOverlap = tokenMatches.filter(token => ROBOTICS_SIGNAL_TOKENS.has(token)).length;

    if (score < 6) continue;
    if (roboticsOverlap < 1 && questionOverlap < 1) continue;

    const confidence = clampNumber(
      Math.round(45 + score * 2 + roboticsOverlap * 7 + questionOverlap * 3),
      45,
      74
    );

    return {
      market: candidate.market,
      score,
      confidence,
      exactMatches: Array.isArray(candidate.exactMatches) ? candidate.exactMatches : [],
      tokenMatches: uniquePreserveOrder([
        ...tokenMatches,
        ...[...ROBOTICS_SIGNAL_TOKENS].filter(token => marketTokenSet.has(token)).slice(0, 2)
      ]).slice(0, 10),
      reasons: [
        ...(Array.isArray(candidate.reasons) ? candidate.reasons : []),
        "Robotics fallback: matched tweet and market on robotics signals when exact event match was sparse."
      ],
      source: "robotics-fallback",
    };
  }

  return null;
}

// buildPublicSearchFallbackMatch and buildDomainMarketFallback removed:
// These low-precision fallbacks matched on generic domain/topic overlap and were
// the primary source of false-positive market matches. The system now returns
// no match when precision search doesn't find a strong candidate.

function rankMarketCandidates(tweetText, limit = 30) {
  const normalizedText = normalizeForMatch(tweetText);
  if (!normalizedText) return [];

  const tweetTokens = tokenizeForMatch(normalizedText);
  const tokenSet = new Set(tweetTokens);
  if (tokenSet.size < 2) return [];

  const tweetBigrams = buildNgrams(tweetTokens, 2);
  const tweetTrigrams = buildNgrams(tweetTokens, 3);

  const baseScored = MARKET_MATCH_INDEX
    .map(entry => scoreMarket(entry, {
      normalizedText,
      tokenSet,
      tweetTokens
    }))
    .sort((a, b) => b.score - a.score);

  const reranked = rerankTopCandidates(baseScored, {
    normalizedText,
    tweetTokens,
    tokenSet,
    tweetBigrams,
    tweetTrigrams
  }, 200);

  return reranked.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function rankCandidatesFromMarkets(markets, tweetText, limit = 30) {
  if (!Array.isArray(markets) || markets.length === 0) return [];

  const normalizedText = normalizeForMatch(tweetText);
  if (!normalizedText) return [];

  const tweetTokens = tokenizeForMatch(normalizedText);
  const tokenSet = new Set(tweetTokens);
  if (tokenSet.size < 2) return [];

  const tweetBigrams = buildNgrams(tweetTokens, 2);
  const tweetTrigrams = buildNgrams(tweetTokens, 3);
  const temporaryIndex = buildMarketMatchIndex(markets);
  const temporaryIndexById = new Map(temporaryIndex.map(entry => [String(entry.market.id), entry]));

  const baseScored = temporaryIndex
    .map(entry => scoreMarket(entry, {
      normalizedText,
      tokenSet,
      tweetTokens
    }))
    .sort((a, b) => b.score - a.score);

  const reranked = rerankTopCandidates(baseScored, {
    normalizedText,
    tweetTokens,
    tokenSet,
    tweetBigrams,
    tweetTrigrams
  }, 180, temporaryIndexById);

  return reranked.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

function selectParserMatchFromRanked(ranked, tweetText = "") {
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;

  const questionOverlap = Number(best.questionTokenOverlap) || 0;
  const highSignalQuestionOverlap = Number(best.highSignalQuestionOverlap) || 0;
  const anchorOverlap = Number(best.anchorOverlap) || 0;
  const distinctMatches = new Set([...best.exactMatches, ...best.tokenMatches]).size;
  const margin = best.score - (second?.score || 0);
  const ngramHits = Number(best.ngramHits) || 0;
  const hasExactMultiTokenPhrase = best.exactMatches.some(match => typeof match === "string" && match.includes(" "));
  const hasStrongSingleSignal = distinctMatches === 1 && best.score >= 12 && margin >= 3;
  const tweetTokens = tokenizeForMatch(tweetText);
  const marketSignalTokenSet = buildMarketSignalTokenSet(best.market);
  const tokenSignals = analyzeMatchSignals(best.tokenMatches, tweetTokens);
  const strictEntitySignals = extractStrictEntitySignals(tweetTokens);
  const strictEntityOverlap = strictEntitySignals.filter(
    token => best.tokenMatches.includes(token) || marketSignalTokenSet.has(token)
  ).length;
  const hasRoboticsTweetSignal = strictEntitySignals.some(token => ROBOTICS_SIGNAL_TOKENS.has(token));
  const hasRoboticsMarketSignal = [...ROBOTICS_SIGNAL_TOKENS].some(token => marketSignalTokenSet.has(token));
  const hasRoboticsAlignment = hasRoboticsTweetSignal && hasRoboticsMarketSignal;
  const tweetDomainGroups = getDomainGroupsFromTweetTokens(tweetTokens);
  const marketDomainGroups = getDomainGroupsFromMarket(best.market);
  const hasDomainOverlap = tweetDomainGroups.size === 0 || setIntersects(tweetDomainGroups, marketDomainGroups);
  const hasExactPhrase = best.exactMatches.length > 0;
  const hasAnchorSignals = tokenSignals.rareCount >= 2 || tokenSignals.veryRareCount >= 1;
  const hasStrongScore = best.score >= STRONG_MATCH_MIN_SCORE;
  const hasWeakScore = best.score >= WEAK_MATCH_MIN_SCORE && margin >= 2;
  const hasPhraseEvidence = ngramHits >= 1 || hasExactMultiTokenPhrase;
  const hasStrongQuestionSignal =
    questionOverlap >= MIN_QUESTION_TOKEN_OVERLAP &&
    (highSignalQuestionOverlap >= MIN_HIGH_SIGNAL_QUESTION_OVERLAP || hasExactPhrase);
  const hasFallbackQuestionSignal = questionOverlap >= 2 && anchorOverlap >= 1;
  const hasMultiQuestionSignal = questionOverlap >= 3 && highSignalQuestionOverlap >= 2;
  const hasRareBackstop =
    (tokenSignals.veryRareCount >= 1 && questionOverlap >= 2) ||
    (tokenSignals.rareCount >= 2 && questionOverlap >= 1);
  const hasEntityDrivenSignal =
    (strictEntityOverlap >= 1 && highSignalQuestionOverlap >= 1) ||
    hasRareBackstop;
  const hasRoboticsBackstop =
    hasRoboticsAlignment &&
    best.score >= 7 &&
    (strictEntityOverlap >= 1 || questionOverlap >= 1);
  const hasEntityAlignment = strictEntitySignals.length === 0 || strictEntityOverlap >= 1 || questionOverlap >= 2;

  if (!hasStrongScore && !hasWeakScore) return null;
  if (!hasEntityAlignment && questionOverlap < 2) return null;
  if (!hasStrongQuestionSignal && !hasFallbackQuestionSignal && !hasRoboticsBackstop) return null;
  if (!hasPhraseEvidence && !hasMultiQuestionSignal && !hasEntityDrivenSignal && !hasRoboticsBackstop) return null;
  if (!hasExactPhrase && !hasAnchorSignals && !hasStrongSingleSignal && !hasEntityDrivenSignal && !hasRoboticsBackstop) return null;
  if (distinctMatches < 2 && !hasStrongSingleSignal && !hasAnchorSignals && !hasRoboticsBackstop) return null;
  if (margin < 1.5 && best.score < 14 && !hasAnchorSignals) return null;
  if (questionOverlap < 2 && !hasPhraseEvidence && !hasEntityDrivenSignal && !hasRoboticsBackstop) return null;
  if (questionOverlap < 2 && strictEntityOverlap < 1 && !hasPhraseEvidence && !hasRoboticsBackstop) return null;
  if (highSignalQuestionOverlap < 1 && !hasPhraseEvidence && !hasStrongSingleSignal && !hasEntityDrivenSignal && !hasRoboticsBackstop) return null;
  if (!tweetHasSufficientSignal(tweetTokens) && !hasExactPhrase) return null;
  if (strictEntitySignals.length > 0 && strictEntityOverlap < 1 && !hasDomainOverlap && best.score < 18) return null;
  if (tweetDomainGroups.size > 0 && !hasDomainOverlap && !hasExactPhrase && best.score < 18) return null;

  const confidence = calculateMatchConfidence(
    best.score,
    margin,
    distinctMatches,
    questionOverlap,
    highSignalQuestionOverlap,
    ngramHits,
    strictEntityOverlap
  );
  const minConfidence = hasRoboticsBackstop ? Math.min(MIN_CONFIDENCE_TO_RENDER, 42) : MIN_CONFIDENCE_TO_RENDER;
  if (confidence < minConfidence) return null;

  const parserMatch = {
    market: best.market,
    score: best.score,
    confidence,
    exactMatches: best.exactMatches,
    tokenMatches: best.tokenMatches,
    reasons: best.reasons,
    source: "parser",
  };

  return enforceMatchAlignment(parserMatch, tweetText);
}

function buildResearchSummary(tweetText, match, mediaAssets = []) {
  const textPreview = String(tweetText || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const matchedTerms = [...new Set([...match.exactMatches, ...match.tokenMatches])].slice(0, 8);
  const method = match.source === "aws-bedrock" ? "Bedrock AI + parser rerank" : "Deterministic parser";
  const normalizedMediaAssets = normalizeMediaAssetsForApi(mediaAssets);

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
      normalizedMediaAssets.length > 0
        ? `Media context sent to matcher: ${normalizedMediaAssets.length} asset${normalizedMediaAssets.length === 1 ? "" : "s"}.`
        : "No media context found on this post.",
      `Matched terms: ${matchedTerms.length ? matchedTerms.join(", ") : "none listed"}.`,
      ...((match.reasons || []).map(reason => `Reason: ${reason}`)),
      textPreview ? `Tweet snippet: "${textPreview}${textPreview.length >= 180 ? "..." : ""}"` : "Tweet snippet unavailable."
    ]
  };
}

function shouldUseAiRerank(mediaAssets = []) {
  const hasMedia = Array.isArray(mediaAssets) && mediaAssets.length > 0;
  if (hasMedia) {
    if (AI_MARKET_MATCH_MEDIA_USED >= AI_MARKET_MATCH_MEDIA_LIMIT_PER_LOAD) {
      return false;
    }
    AI_MARKET_MATCH_MEDIA_USED += 1;
    return true;
  }
  if (AI_MARKET_MATCH_USED >= AI_MARKET_MATCH_LIMIT_PER_LOAD) {
    return false;
  }
  AI_MARKET_MATCH_USED += 1;
  return true;
}

function shouldUseAiSearchQueryEnhancer(mediaAssets = []) {
  const hasMedia = Array.isArray(mediaAssets) && mediaAssets.length > 0;
  if (hasMedia) {
    if (AI_SEARCH_QUERY_MEDIA_USED >= AI_SEARCH_QUERY_MEDIA_LIMIT_PER_LOAD) {
      return false;
    }
    AI_SEARCH_QUERY_MEDIA_USED += 1;
    return true;
  }
  if (AI_SEARCH_QUERY_USED >= AI_SEARCH_QUERY_LIMIT_PER_LOAD) {
    return false;
  }
  AI_SEARCH_QUERY_USED += 1;
  return true;
}

async function rerankWithAi(tweetText, rankedCandidates, parserMatch, mediaAssets = []) {
  const endpoint = getAiMarketMatchEndpoint();
  if (!endpoint) {
    return null;
  }

  const tweetTokens = tokenizeForMatch(tweetText).slice(0, 24);
  const strictTweetEntities = extractStrictEntitySignals(tweetTokens).slice(0, 12);
  const derivedTweetEntities = deriveQuerySignalEntities(
    tweetText,
    mediaAssets,
    { includeCryptoFallbackAsset: false }
  ).slice(0, 12);
  const tweetEntities = uniquePreserveOrder([
    ...strictTweetEntities,
    ...derivedTweetEntities
  ]).slice(0, 12);
  const tweetDomainHints = [...deriveDomainHintsFromContent(tweetText, normalizeMediaAssetsForApi(mediaAssets))].slice(0, 8);

  const payload = {
    tweet_text: String(tweetText || "").slice(0, 2500),
    tweet_tokens: tweetTokens,
    tweet_entities: tweetEntities,
    tweet_domain_hints: tweetDomainHints,
    media_assets: normalizeMediaAssetsForApi(mediaAssets),
    search_debug: getTweetSearchDebug(tweetText),
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
      parser_rank: Number(candidate.rank) || 0,
      parser_score: Number(candidate.score) || 0,
      parser_terms: [...new Set([...(candidate.exactMatches || []), ...(candidate.tokenMatches || [])])].slice(0, 10),
      parser_reasons: Array.isArray(candidate.reasons) ? candidate.reasons.slice(0, 4) : [],
    })),
  };

  try {
    const data = await fetchJsonWithExtensionSupport(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 2600
    });
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

function getAiMarketQueryEndpoint() {
  const fromStorage = safeReadLocalStorage("instamarket_ai_query_endpoint");
  const fromWindow =
    typeof window !== "undefined" && typeof window.INSTAMARKET_AI_QUERY_ENDPOINT === "string"
      ? window.INSTAMARKET_AI_QUERY_ENDPOINT
      : "";

  const explicit = normalizeEndpoint(fromStorage || fromWindow || "");
  if (explicit) return explicit;

  const matchEndpoint = getAiMarketMatchEndpoint();
  if (matchEndpoint.includes("/v1/match-market")) {
    return matchEndpoint.replace("/v1/match-market", "/v1/extract-market-query");
  }

  return normalizeEndpoint(AI_MARKET_QUERY_ENDPOINT_DEFAULT);
}

async function queryAiPublicSearchQueries(
  tweetText,
  parserQueries,
  maxQueries = PUBLIC_SEARCH_MAX_QUERIES,
  options = {},
  mediaAssets = [],
) {
  const endpoint = getAiMarketQueryEndpoint();
  if (!endpoint) return [];
  const signalEntities = deriveQuerySignalEntities(tweetText, mediaAssets).slice(0, 12);

  const normalizedMediaAssets = normalizeMediaAssetsForApi(mediaAssets);
  const domainHints = [...deriveDomainHintsFromContent(tweetText, normalizedMediaAssets)].slice(0, 8);
  const mediaTextHints = extractMediaHintTokens(normalizedMediaAssets);

  const payload = {
    tweet_text: String(tweetText || "").slice(0, 2500),
    parser_queries: Array.isArray(parserQueries) ? parserQueries.slice(0, 8) : [],
    max_queries: clampNumber(Number(maxQueries) || PUBLIC_SEARCH_MAX_QUERIES, 1, 8),
    search_zero_hits: Boolean(options?.searchZeroHits),
    tweet_tokens: tokenizeForSearchQuery(tweetText).slice(0, 24),
    signal_entities: signalEntities,
    domain_hints: domainHints,
    media_assets: normalizedMediaAssets,
    media_text_hints: mediaTextHints,
  };

  try {
    const data = await fetchJsonWithExtensionSupport(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 2400
    });
    if (!data || typeof data !== "object" || !Array.isArray(data.queries)) {
      return [];
    }

    return data.queries
      .map(value => String(value || "").trim())
      .filter(Boolean)
      .slice(0, maxQueries + 2);
  } catch {
    return [];
  }
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

async function fetchJsonWithExtensionSupport(url, options = {}) {
  const viaExtension = await fetchJsonViaExtensionWorker(url, options);
  if (viaExtension) {
    if (!viaExtension.ok) {
      throw new Error(viaExtension.error || `Request failed (${viaExtension.status || 0})`);
    }
    return viaExtension.json;
  }

  try {
    const fallback = await fetchJsonDirect(url, options);
    if (!fallback.ok) {
      throw new Error(fallback.error || `Request failed (${fallback.status || 0})`);
    }
    return fallback.json;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new Error(`No extension bridge response and direct fetch failed: ${message}`);
  }
}

async function fetchJsonViaExtensionWorker(url, options = {}) {
  if (!canUseExtensionMessageBridge()) {
    return null;
  }

  const request = {
    url,
    method: String(options.method || "GET").toUpperCase(),
    headers: options.headers || {},
    body: typeof options.body === "string" ? options.body : "",
    timeoutMs: Number(options.timeoutMs) || DEFAULT_FETCH_TIMEOUT_MS
  };

  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(
        { type: EXTENSION_JSON_FETCH_MESSAGE, request },
        response => {
          const lastError = chrome.runtime?.lastError;
          if (lastError || !response || response.type !== EXTENSION_JSON_FETCH_MESSAGE) {
            resolve(null);
            return;
          }
          resolve(response);
        }
      );
    } catch {
      resolve(null);
    }
  });
}

async function fetchJsonDirect(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = clampNumber(Number(options.timeoutMs) || DEFAULT_FETCH_TIMEOUT_MS, 1000, 30000);
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const init = {
      method,
      headers: options.headers || {},
      credentials: "omit",
      signal: controller?.signal
    };
    if (method === "GET") {
      init.cache = "no-store";
    }
    if (typeof options.body === "string" && method !== "GET" && method !== "HEAD") {
      init.body = options.body;
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const json = parseJsonSafe(text);
    return {
      ok: response.ok,
      status: response.status,
      json,
      error: response.ok ? "" : `Request failed (${response.status})`
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function canUseExtensionMessageBridge() {
  return Boolean(
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function" &&
    chrome.runtime.id
  );
}

function parseJsonSafe(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function fetchJsonWithRetry(url, options = {}, retries = PAGE_FETCH_RETRIES) {
  let lastError = null;
  const attemptCount = Math.max(0, Number(retries)) + 1;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    try {
      return await fetchJsonWithExtensionSupport(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= attemptCount - 1) break;
      await delay(180 * (attempt + 1));
    }
  }

  throw (lastError || new Error("Fetch failed after retries"));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPublicSearchQuery(tweetText, mediaAssets = []) {
  const mediaTokens = extractMediaHintTokens(mediaAssets);
  const tokens = [...tokenizeForSearchQuery(tweetText), ...mediaTokens];
  const strictEntitySet = new Set(extractStrictEntitySignals(tokenizeForMatch(tweetText)));
  if (!tokens.length) return "";

  const orderedUnique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    orderedUnique.push(token);
  }

  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  const weighted = orderedUnique
    .filter(token => token.length >= 3)
    .map(token => {
      const df = MARKET_TOKEN_DF.get(token) || marketCount;
      const ratio = df / marketCount;
      const rarityWeight = clampNumber(0.8 - ratio, 0, 0.8);
      const lengthWeight = token.length >= 8 ? 0.5 : token.length >= 6 ? 0.3 : 0;
      const canonicalWeight = TOKEN_CANONICAL_MAP.has(token) ? 0.45 : 0;
      const numericWeight = /\d/.test(token) ? 0.35 : 0;
      const strictEntityBoost = strictEntitySet.has(token) ? 0.7 : 0;
      const lowSignalPenalty = LOW_SIGNAL_MATCH_TOKENS.has(token) ? 0.8 : 0;
      return {
        token,
        weight: rarityWeight + lengthWeight + canonicalWeight + numericWeight + strictEntityBoost - lowSignalPenalty
      };
    })
    .sort((left, right) => right.weight - left.weight);

  const selected = weighted
    .filter(item => item.weight >= 0.35)
    .slice(0, 7)
    .map(item => item.token);

  const fallback = orderedUnique.filter(token => token.length >= 4).slice(0, 5);
  const finalTokens = selected.length >= 2 ? selected : fallback;
  if (finalTokens.length < 2) return "";
  return finalTokens.join(" ");
}

function buildParserPublicSearchQueries(tweetText, mediaAssets = []) {
  const primary = buildPublicSearchQuery(tweetText, mediaAssets);
  const mediaTokens = extractMediaHintTokens(mediaAssets);
  const tokens = [...tokenizeForSearchQuery(tweetText), ...mediaTokens];
  const strictEntitySet = new Set(extractStrictEntitySignals(tokenizeForMatch(tweetText)));
  const orderedUnique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    orderedUnique.push(token);
  }

  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  const orderedWeighted = orderedUnique
    .map(token => {
      const df = MARKET_TOKEN_DF.get(token) || marketCount;
      const ratio = df / marketCount;
      const rarityWeight = clampNumber(0.7 - ratio, 0, 0.7);
      const lengthWeight = token.length >= 7 ? 0.35 : token.length >= 5 ? 0.2 : 0;
      const strictEntityBoost = strictEntitySet.has(token) ? 0.6 : 0;
      const lowSignalPenalty = LOW_SIGNAL_MATCH_TOKENS.has(token) ? 0.55 : 0;
      return {
        token,
        weight: rarityWeight + lengthWeight + strictEntityBoost - lowSignalPenalty
      };
    })
    .filter(item => item.weight >= 0.3)
    .slice(0, 8)
    .map(item => item.token);

  const orderedQuery = orderedWeighted.slice(0, 6).join(" ");
  const phraseCandidates = [...buildNgrams(tokens, 2)]
    .filter(gram => gram.split(" ").every(token => token.length >= 4))
    .slice(0, 3);
  const phraseQuery = phraseCandidates[0] || "";
  const hintQueries = buildDomainHintQueries(tokens);

  return [...new Set([...hintQueries, primary, orderedQuery, phraseQuery].filter(query => query && query.trim().length >= 3))]
    .slice(0, PUBLIC_SEARCH_MAX_QUERIES);
}

function buildDomainHintQueries(tokens) {
  const tokenSet = new Set(Array.isArray(tokens) ? tokens : []);
  const hints = [];

  for (const mapping of DOMAIN_HINT_QUERY_MAP) {
    const overlap = mapping.tokens.filter(token => tokenSet.has(token)).length;
    if (overlap >= 1) {
      hints.push(mapping.query);
    }
  }

  return hints.slice(0, 2);
}

function sanitizeSearchQueries(queries, tweetText, options = {}) {
  const tweetSearchTokenSet = new Set(tokenizeForSearchQuery(tweetText));
  const tweetMatchTokens = tokenizeForMatch(tweetText);
  const strictEntities = new Set(extractStrictEntitySignals(tweetMatchTokens));
  const tweetDomainGroups = getDomainGroupsFromTweetTokens(tweetMatchTokens);
  const tweetAnchors = new Set(tweetMatchTokens.filter(token => DOMAIN_ANCHOR_TOKENS.has(token)));
  const requiredAnchors = new Set(
    (Array.isArray(options.requiredAnchors) ? options.requiredAnchors : [])
      .map(token => stemToken(String(token || "").trim().toLowerCase()))
      .filter(token => token.length >= 3),
  );

  const effectiveRequiredAnchors = new Set(
    [...requiredAnchors].filter(
      token => STRICT_ENTITY_TOKENS.has(token) || DOMAIN_ANCHOR_TOKENS.has(token) || MARKET_TOKEN_DF.has(token)
    )
  );

  const rawQueries = [...new Set((Array.isArray(queries) ? queries : [])
    .map(query => String(query || "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(query => query.length >= 3 && query.length <= 120))];

  const accepted = [];
  for (const rawQuery of rawQueries) {
    const querySearchTokens = tokenizeForSearchQuery(rawQuery);
    const queryMatchTokens = tokenizeForMatch(rawQuery);
    const compactQueryTokens = uniquePreserveOrder(queryMatchTokens).slice(0, 6);
    if (querySearchTokens.length < 1 || compactQueryTokens.length < 1) continue;

    if (querySearchTokens.length === 1) {
      const singleton = compactQueryTokens[0] || "";
      const singletonHasSignal =
        strictEntities.has(singleton) ||
        DOMAIN_ANCHOR_TOKENS.has(singleton) ||
        /\d/.test(singleton);
      if (!singletonHasSignal) continue;
    }

    const hasStrongQueryToken = compactQueryTokens.some(token => !LOW_SIGNAL_MATCH_TOKENS.has(token));
    if (!hasStrongQueryToken) continue;

    if (effectiveRequiredAnchors.size > 0) {
      const hasAnchor = queryContainsAnchor(compactQueryTokens, effectiveRequiredAnchors);
      if (!hasAnchor) {
        const lexicalOverlapCount = querySearchTokens.filter(token => tweetSearchTokenSet.has(token)).length;
        if (lexicalOverlapCount < 2) continue;
      }
    }

    const queryDomainGroups = getDomainGroupsFromTweetTokens(compactQueryTokens);
    const queryEntityOverlap = compactQueryTokens.some(token => strictEntities.has(token));
    const queryAnchorOverlap = compactQueryTokens.some(token => tweetAnchors.has(token));
    const hasDomainGroupOverlap =
      tweetDomainGroups.size === 0 || setIntersects(tweetDomainGroups, queryDomainGroups);

    if (strictEntities.size > 0 && !queryEntityOverlap && !hasDomainGroupOverlap) continue;
    if (strictEntities.size === 0 && tweetAnchors.size > 0 && !queryAnchorOverlap && !hasDomainGroupOverlap) continue;

    const overlap = querySearchTokens.filter(token => tweetSearchTokenSet.has(token)).length;
    if (overlap < 1 && !queryEntityOverlap && !queryAnchorOverlap && !hasDomainGroupOverlap) continue;

    accepted.push(compactQueryTokens.join(" "));
  }

  return uniquePreserveOrder(accepted);
}

function mergeSearchQueries(preferredQueries, fallbackQueries, maxItems = PUBLIC_SEARCH_MAX_QUERIES) {
  return [...new Set([...(preferredQueries || []), ...(fallbackQueries || [])])]
    .filter(Boolean)
    .slice(0, maxItems);
}

function uniquePreserveOrder(values) {
  const seen = new Set();
  const unique = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

async function fetchPublicSearchMarketsForTweet(tweetText, mediaAssets = []) {
  const tweetMatchTokens = tokenizeForMatch(tweetText);
  const strictEntityCount = extractStrictEntitySignals(tweetMatchTokens).length;
  const derivedHints = deriveDomainHintsFromContent(tweetText, mediaAssets);
  const dynamicMaxQueries = strictEntityCount > 0 ? PUBLIC_SEARCH_MAX_QUERIES : 2;
  const aiQueryEnhancerEligible =
    strictEntityCount > 0 ||
    (derivedHints.size > 0 && tweetMatchTokens.length >= 8);
  const searchAnchors = extractSearchAnchorTokens(tweetText, mediaAssets);
  const parserQueries = sanitizeSearchQueries(
    buildParserPublicSearchQueries(tweetText, mediaAssets),
    tweetText,
    { requiredAnchors: searchAnchors }
  ).slice(0, dynamicMaxQueries);
  if (!parserQueries.length) return [];

  let finalQueries = [...parserQueries];
  let usedAiQueryEnhancer = false;
  let retriedZeroHits = false;
  if (aiQueryEnhancerEligible && shouldUseAiSearchQueryEnhancer(mediaAssets)) {
    const aiRawQueries = await queryAiPublicSearchQueries(
      tweetText,
      parserQueries,
      dynamicMaxQueries,
      {},
      mediaAssets
    );
    const aiQueries = sanitizeSearchQueries(aiRawQueries, tweetText, {
      requiredAnchors: searchAnchors
    });
    if (aiQueries.length > 0) {
      finalQueries = mergeSearchQueries(aiQueries, parserQueries, dynamicMaxQueries + 1);
      usedAiQueryEnhancer = true;
    }
  }

  const payloads = await Promise.all(finalQueries.map(query => fetchPublicSearchMarkets(query)));
  let merged = mergeUniqueMarkets(payloads);

  // If the first pass found nothing, ask AI for broader queries and retry once.
  if (
    merged.length === 0 &&
    strictEntityCount > 0 &&
    aiQueryEnhancerEligible &&
    shouldUseAiSearchQueryEnhancer(mediaAssets)
  ) {
    retriedZeroHits = true;
    const broadenedRawQueries = await queryAiPublicSearchQueries(
      tweetText,
      finalQueries,
      dynamicMaxQueries + 1,
      { searchZeroHits: true },
      mediaAssets
    );
    const broadenedQueries = sanitizeSearchQueries(broadenedRawQueries, tweetText, {
      requiredAnchors: searchAnchors
    });
    if (broadenedQueries.length > 0) {
      const retryPayloads = await Promise.all(
        mergeSearchQueries(broadenedQueries, finalQueries, dynamicMaxQueries + 2)
          .map(query => fetchPublicSearchMarkets(query))
      );
      merged = mergeUniqueMarkets(retryPayloads);
    }
  }

  saveTweetSearchDebug(tweetText, {
    queries: finalQueries,
    merged_count: merged.length,
    top_market_questions: merged.slice(0, 6).map(market => market?.question || "").filter(Boolean),
    used_ai_query_enhancer: usedAiQueryEnhancer,
    retried_zero_hits: retriedZeroHits
  });

  return merged.slice(0, PUBLIC_SEARCH_MAX_MERGED_MARKETS);
}

function mergeUniqueMarkets(payloads) {
  const merged = [];
  const seen = new Set();

  for (const list of payloads) {
    for (const market of Array.isArray(list) ? list : []) {
      const key = String(market?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(market);
    }
  }

  return merged;
}

async function fetchPublicSearchMarkets(query) {
  const key = normalizeForMatch(query);
  if (!key) return [];

  const now = Date.now();
  const cached = PUBLIC_SEARCH_CACHE.get(key);
  if (cached && now - cached.savedAt < PUBLIC_SEARCH_CACHE_MAX_AGE_MS) {
    return cached.markets;
  }

  const endpoint = `${POLYMARKET_PUBLIC_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
  try {
    const payload = await fetchJsonWithRetry(endpoint, {
      method: "GET",
      timeoutMs: 2400
    }, 0);

    const events = Array.isArray(payload?.events) ? payload.events.slice(0, PUBLIC_SEARCH_MAX_EVENTS) : [];
    const rawMarkets = [];
    for (const event of events) {
      const eventMarkets = Array.isArray(event?.markets) ? event.markets : [];
      for (const market of eventMarkets) {
        if (!market || market.active === false || market.closed === true) continue;
        rawMarkets.push({
          ...market,
          events: [event]
        });
      }
    }

    const mapped = dedupeMarketsById(rawMarkets)
      .map(mapPolymarketMarket)
      .filter(Boolean)
      .slice(0, PUBLIC_SEARCH_MAX_MARKETS);

    PUBLIC_SEARCH_CACHE.set(key, {
      savedAt: now,
      markets: mapped
    });

    prunePublicSearchCache();
    return mapped;
  } catch {
    return [];
  }
}

function prunePublicSearchCache() {
  if (PUBLIC_SEARCH_CACHE.size <= 48) return;
  const entries = [...PUBLIC_SEARCH_CACHE.entries()].sort((left, right) => left[1].savedAt - right[1].savedAt);
  for (let index = 0; index < entries.length - 48; index += 1) {
    PUBLIC_SEARCH_CACHE.delete(entries[index][0]);
  }
}

function scoreMarket(entry, matchInput) {
  const normalizedText = matchInput.normalizedText;
  const tokenSet = matchInput.tokenSet;
  const tweetTokens = Array.isArray(matchInput.tweetTokens) ? matchInput.tweetTokens : [];

  let score = 0;
  const exactMatches = [];
  const tokenMatches = [];
  const reasons = [];
  let questionTokenOverlap = 0;
  let highSignalQuestionOverlap = 0;
  let contextTokenOverlap = 0;
  let anchorOverlap = 0;

  for (const phrase of entry.keywordPhrases) {
    if (!phrase) continue;
    if (normalizedText.includes(phrase)) {
      exactMatches.push(phrase);
      score += scoreExactPhraseHit(phrase);
    }
  }

  for (const token of entry.allTokenSet) {
    if (tokenSet.has(token)) {
      tokenMatches.push(token);
      const tokenBaseWeight = tokenWeight(token);
      const dfRatio = (MARKET_TOKEN_DF.get(token) || MARKET_MATCH_INDEX.length) / Math.max(1, MARKET_MATCH_INDEX.length);
      if (entry.questionTokenSet.has(token)) {
        questionTokenOverlap += 1;
        if (dfRatio <= 0.12) {
          highSignalQuestionOverlap += 1;
        }
        score += tokenBaseWeight + 1.35;
      } else {
        if (entry.anchorTokenSet.has(token)) {
          anchorOverlap += 1;
          score += 0.9;
        }
        score += tokenBaseWeight;
      }
    }
  }

  if (entry.questionTokens.length > 0) {
    const coverageRatio = questionTokenOverlap / entry.questionTokens.length;
    score += coverageRatio * 11;
  }

  if (entry.contextTokens.length > 0 && (questionTokenOverlap > 0 || exactMatches.length > 0)) {
    for (const token of entry.contextTokenSet) {
      if (tokenSet.has(token)) {
        contextTokenOverlap += 1;
      }
    }
    if (contextTokenOverlap > 0) {
      const contextCoverage = contextTokenOverlap / Math.max(10, entry.contextTokens.length);
      score += contextCoverage * 5.5;
    }
  }

  const distinctMatches = new Set([...exactMatches, ...tokenMatches]).size;
  if (distinctMatches > 1) {
    score += Math.min(7, distinctMatches * 1.15);
  }

  if (exactMatches.length === 0 && distinctMatches <= 1) {
    score *= 0.2;
  } else if (exactMatches.length === 0 && questionTokenOverlap === 0) {
    score *= 0.45;
  }

  const tweetSignalBoost = getTweetSignalBoost(tweetTokens, tokenSet);
  score += tweetSignalBoost;

  const topicPenalty = getGenericTopicPenalty(tokenMatches);
  score -= topicPenalty;

  if (score < 0) {
    score = 0;
  }

  if (exactMatches.length > 0) {
    reasons.push(`Exact keyword phrases: ${exactMatches.join(", ")}`);
  }
  if (tokenMatches.length > 0) {
    reasons.push(`Token overlap: ${tokenMatches.join(", ")}`);
  }
  if (contextTokenOverlap > 0) {
    reasons.push(`Context overlap: ${contextTokenOverlap} tokens`);
  }

  return {
    market: entry.market,
    score,
    exactMatches,
    tokenMatches,
    reasons,
    questionTokenOverlap,
    highSignalQuestionOverlap,
    contextTokenOverlap,
    anchorOverlap
  };
}

function rerankTopCandidates(scored, matchInput, rerankLimit = 200, indexById = MARKET_MATCH_INDEX_BY_ID) {
  if (!Array.isArray(scored) || scored.length === 0) return [];

  const topSlice = scored.slice(0, rerankLimit).map(item => {
    const entry = indexById.get(String(item.market.id));
    if (!entry) return item;

    const ngramSignal = getNgramSignal(entry, matchInput.tweetBigrams, matchInput.tweetTrigrams);
    const fuzzySignal = getFuzzySignal(matchInput.tweetTokens, entry.questionTokens, matchInput.tokenSet);
    const anchorSignal = getAnchorSignal(entry, matchInput.tokenSet);

    let updatedScore = item.score;
    updatedScore += ngramSignal.bigramHits * 4.2;
    updatedScore += ngramSignal.trigramHits * 7.2;
    updatedScore += fuzzySignal * 1.9;
    updatedScore += anchorSignal * 2.1;

    const reasons = [...item.reasons];
    if (ngramSignal.bigramHits > 0 || ngramSignal.trigramHits > 0) {
      reasons.push(`Phrase overlap: ${ngramSignal.bigramHits} bi-grams, ${ngramSignal.trigramHits} tri-grams`);
    }
    if (fuzzySignal > 0) {
      reasons.push(`Fuzzy lexical signal: +${fuzzySignal.toFixed(1)}`);
    }
    if (anchorSignal > 0) {
      reasons.push(`Anchor signal: +${anchorSignal.toFixed(1)}`);
    }

    return {
      ...item,
      score: updatedScore,
      reasons,
      bigramHits: ngramSignal.bigramHits,
      trigramHits: ngramSignal.trigramHits,
      ngramHits: ngramSignal.bigramHits + ngramSignal.trigramHits
    };
  });

  const remainder = scored.slice(rerankLimit);
  return [...topSlice, ...remainder].sort((a, b) => b.score - a.score);
}

function getNgramSignal(entry, tweetBigrams, tweetTrigrams) {
  const bigramHits = overlapCount(tweetBigrams, entry.allBigrams);
  const trigramHits = overlapCount(tweetTrigrams, entry.questionTrigrams);
  return { bigramHits, trigramHits };
}

function getFuzzySignal(tweetTokens, questionTokens, tokenSet) {
  if (!Array.isArray(tweetTokens) || !Array.isArray(questionTokens)) return 0;
  let signal = 0;
  for (const sourceToken of tweetTokens) {
    if (sourceToken.length < 5) continue;
    if (tokenSet.has(sourceToken) && questionTokens.includes(sourceToken)) continue;
    for (const targetToken of questionTokens) {
      if (targetToken.length < 5) continue;
      if (sourceToken === targetToken) continue;
      if (isPrefixVariant(sourceToken, targetToken) || withinEditDistanceOne(sourceToken, targetToken)) {
        signal += 1;
        break;
      }
    }
  }
  return Math.min(4, signal);
}

function getAnchorSignal(entry, tokenSet) {
  let hits = 0;
  for (const token of entry.anchorTokenSet) {
    if (tokenSet.has(token)) hits += 1;
  }
  return Math.min(4, hits);
}

function overlapCount(leftSet, rightSet) {
  if (!leftSet || !rightSet) return 0;
  let hits = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) hits += 1;
  }
  return hits;
}

function getTweetSignalBoost(tweetTokens, tokenSet) {
  if (!Array.isArray(tweetTokens) || tweetTokens.length === 0) return 0;
  let boost = 0;
  const unique = new Set(tweetTokens);
  for (const token of unique) {
    const df = MARKET_TOKEN_DF.get(token) || MARKET_MATCH_INDEX.length;
    const ratio = df / Math.max(1, MARKET_MATCH_INDEX.length);
    if (token.length >= 6 && ratio <= 0.03) boost += 0.9;
    else if (token.length >= 5 && ratio <= 0.07) boost += 0.45;
    if (tokenSet.has(token) && token.includes("20")) boost += 0.2;
  }
  return Math.min(3.2, boost);
}

function getGenericTopicPenalty(tokenMatches) {
  if (!Array.isArray(tokenMatches) || tokenMatches.length === 0) return 0;
  let penalty = 0;
  for (const token of tokenMatches) {
    const df = MARKET_TOKEN_DF.get(token) || MARKET_MATCH_INDEX.length;
    const ratio = df / Math.max(1, MARKET_MATCH_INDEX.length);
    if (ratio >= 0.4) penalty += 0.25;
    if (ratio >= 0.65) penalty += 0.4;
  }
  return Math.min(2.4, penalty);
}

function tokenWeight(token) {
  const df = MARKET_TOKEN_DF.get(token) || 1;
  const base = clampNumber(3.6 - Math.log2(df + 1), 0.45, 3.25);
  if (LOW_SIGNAL_MATCH_TOKENS.has(token)) {
    return Math.max(0.2, base * 0.35);
  }
  return base;
}

function calculateMatchConfidence(
  score,
  margin,
  distinctMatches,
  questionOverlap = 0,
  highSignalQuestionOverlap = 0,
  ngramHits = 0,
  strictEntityOverlap = 0
) {
  const cappedMargin = clampNumber(margin, 0, 5);
  const raw =
    8 +
    score * 1.45 +
    cappedMargin * 3.8 +
    distinctMatches * 1.2 +
    questionOverlap * 3.2 +
    highSignalQuestionOverlap * 5.6 +
    ngramHits * 4.8 +
    strictEntityOverlap * 8.2;

  let bounded = clampNumber(raw, 35, 99);
  if (questionOverlap < 2) {
    bounded = Math.min(bounded, 70);
  }
  if (questionOverlap < 2 && ngramHits === 0 && strictEntityOverlap === 0) {
    bounded = Math.min(bounded, 55);
  }
  if (questionOverlap < 3 && highSignalQuestionOverlap < 2) {
    bounded = Math.min(bounded, 82);
  }
  if (ngramHits === 0 && questionOverlap < 4) {
    bounded = Math.min(bounded, 86);
  }
  return Math.round(bounded);
}

function analyzeMatchSignals(tokenMatches, tweetTokens) {
  const tweetSet = new Set(tweetTokens);
  const uniqueMatches = [...new Set(tokenMatches)].filter(token => tweetSet.has(token));
  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);

  let rareCount = 0;
  let veryRareCount = 0;
  for (const token of uniqueMatches) {
    const df = MARKET_TOKEN_DF.get(token) || marketCount;
    const ratio = df / marketCount;
    if (ratio <= RARE_TOKEN_DF_RATIO) rareCount += 1;
    if (ratio <= VERY_RARE_TOKEN_DF_RATIO) veryRareCount += 1;
  }

  return {
    rareCount,
    veryRareCount
  };
}

function extractStrictEntitySignals(tweetTokens) {
  const tokens = [...new Set(Array.isArray(tweetTokens) ? tweetTokens : [])];
  return tokens.filter(token => STRICT_ENTITY_TOKENS.has(token));
}

function tweetHasSufficientSignal(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  let signalCount = 0;
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (LOW_SIGNAL_MATCH_TOKENS.has(token)) continue;
    const df = MARKET_TOKEN_DF.get(token) || marketCount;
    const ratio = df / marketCount;
    if (ratio <= 0.25) {
      signalCount += 1;
    }
    if (signalCount >= 2) return true;
  }
  return false;
}

// Signal-level classifier: determines how aggressively to match a tweet.
// Level 0 = SKIP (no bettable signal), Level 1 = LOCAL ONLY (parser, capped confidence),
// Level 2 = FULL PIPELINE (search + AI rerank).
function classifyTweetSignalLevel(tweetText, mediaAssets) {
  const tokens = tokenizeForMatch(tweetText);
  if (tokens.length < 3) return 0;

  const strictEntities = extractStrictEntitySignals(tokens);
  const domainHints = deriveDomainHintsFromContent(tweetText, mediaAssets);
  const hasNumericAnchor = tokens.some(t => /\d{4}/.test(t) || /\$\d/.test(t));
  const nonLowSignalTokens = tokens.filter(
    t => !LOW_SIGNAL_MATCH_TOKENS.has(t) && !MATCH_STOP_WORDS.has(t) && t.length >= 4
  );

  // No meaningful signal at all — skip entirely
  if (nonLowSignalTokens.length < 2 && strictEntities.length === 0) return 0;

  // Has specific named entities or numeric anchors — full pipeline
  if (strictEntities.length >= 1 || hasNumericAnchor) return 2;

  // Has domain context and enough substantive tokens — parser-only with capped confidence
  if (domainHints.size >= 1 && nonLowSignalTokens.length >= 3) return 1;

  return 0;
}

function rebuildMarketMatchIndex() {
  MARKET_MATCH_INDEX = buildMarketMatchIndex(MARKET_UNIVERSE);
  MARKET_TOKEN_DF = buildTokenDocumentFrequency(MARKET_MATCH_INDEX);
  MARKET_MATCH_INDEX_BY_ID = new Map(MARKET_MATCH_INDEX.map(entry => [String(entry.market.id), entry]));
}

function buildMarketMatchIndex(markets) {
  return markets.map(market => {
    const keywordPhrases = buildKeywordPhrases(market);
    const questionTokens = tokenizeForMatch(market.question);
    const keywordTokens = keywordPhrases.flatMap(tokenizeForMatch);
    const contextTokens = buildContextTokens(market);
    const anchorTokenSet = new Set(buildAnchorTokens(market));
    const allTokenSet = new Set([...questionTokens, ...keywordTokens, ...anchorTokenSet]);
    const questionTokenSet = new Set(questionTokens);
    const contextTokenSet = new Set(contextTokens);
    const allBigrams = new Set([
      ...buildNgrams(questionTokens, 2),
      ...buildNgrams(keywordTokens, 2),
      ...buildNgrams(contextTokens.slice(0, 28), 2)
    ]);
    const questionTrigrams = buildNgrams(questionTokens, 3);

    return {
      market,
      questionTokens,
      contextTokens,
      keywordPhrases,
      allTokenSet,
      questionTokenSet,
      contextTokenSet,
      anchorTokenSet,
      allBigrams,
      questionTrigrams
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
    const filtered = market.keywords
      .map(normalizeForMatch)
      .filter(Boolean)
      .filter(isStrongKeywordPhrase);
    base.push(...filtered);
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

function isStrongKeywordPhrase(phrase) {
  if (typeof phrase !== "string") return false;
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  if (trimmed.includes(" ")) return trimmed.length >= 6;
  return trimmed.length >= 6;
}

function scoreExactPhraseHit(phrase) {
  if (typeof phrase !== "string" || phrase.length < 2) return 0;
  if (phrase.includes(" ")) {
    return 8;
  }

  const token = phrase.trim();
  if (!token || token.length < 6) return 0;
  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  const df = MARKET_TOKEN_DF.get(token) || marketCount;
  const ratio = df / marketCount;

  if (ratio > 0.06) return 0;
  if (ratio <= 0.015) return 4.8;
  if (ratio <= 0.03) return 3.8;
  return 2.7;
}

function buildContextTokens(market) {
  const contextBlocks = [
    market.description,
    market.eventDescription,
    market.eventContextDescription
  ]
    .filter(value => typeof value === "string" && value.trim().length > 0)
    .slice(0, 3)
    .map(value => value.slice(0, 700));

  const contextTokens = contextBlocks.flatMap(tokenizeForMatch).filter(token => token.length >= 4);
  return [...new Set(contextTokens)].slice(0, 64);
}

function buildAnchorTokens(market) {
  const raw = [
    market.category,
    market.eventTitle,
    market.ticker,
    ...(Array.isArray(market.eventTags) ? market.eventTags : [])
  ]
    .filter(Boolean)
    .map(normalizeForMatch)
    .flatMap(tokenizeForMatch)
    .filter(token => token.length >= 3);

  return [...new Set(raw)].slice(0, 24);
}

function buildNgrams(tokens, n) {
  const source = Array.isArray(tokens) ? tokens : [];
  if (source.length < n || n <= 1) {
    return new Set();
  }

  const grams = new Set();
  for (let index = 0; index <= source.length - n; index += 1) {
    const gram = source.slice(index, index + n).join(" ");
    if (gram.length > 0) {
      grams.add(gram);
    }
  }
  return grams;
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
      polymarketUrl: typeof market.polymarketUrl === "string" ? market.polymarketUrl : "",
      description: typeof market.description === "string" ? market.description : "",
      eventDescription: typeof market.eventDescription === "string" ? market.eventDescription : "",
      eventContextDescription: typeof market.eventContextDescription === "string" ? market.eventContextDescription : "",
      ticker: typeof market.ticker === "string" ? market.ticker : "",
      eventTags: Array.isArray(market.eventTags) ? market.eventTags.map(String) : []
    }));

  rebuildMarketMatchIndex();
}

function writeMarketUniverseCache(markets) {
  if (!Array.isArray(markets) || markets.length === 0) return;
  try {
    if (typeof localStorage === "undefined") return;

    const compact = markets
      .slice(0, MARKET_UNIVERSE_CACHE_MAX_ITEMS)
      .map(market => ({
        id: String(market.id),
        question: String(market.question || ""),
        yesOdds: Number(market.yesOdds) || 50,
        noOdds: Number(market.noOdds) || 50,
        volume: String(market.volume || "$0 Vol"),
        keywords: Array.isArray(market.keywords) ? market.keywords.slice(0, 36).map(String) : [],
        relatedMarkets: Array.isArray(market.relatedMarkets) ? market.relatedMarkets.slice(0, 6).map(String) : [],
        category: String(market.category || ""),
        slug: String(market.slug || ""),
        eventTitle: String(market.eventTitle || ""),
        polymarketUrl: String(market.polymarketUrl || ""),
        ticker: String(market.ticker || "")
      }));

    const payload = {
      savedAt: Date.now(),
      markets: compact
    };
    localStorage.setItem(MARKET_UNIVERSE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function readMarketUniverseCache() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(MARKET_UNIVERSE_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const savedAt = Number(parsed.savedAt) || 0;
    if (Date.now() - savedAt > MARKET_UNIVERSE_CACHE_MAX_AGE_MS) {
      return [];
    }
    const markets = Array.isArray(parsed.markets) ? parsed.markets : [];
    return markets;
  } catch {
    return [];
  }
}

function getMarketUniverse() {
  return MARKET_UNIVERSE;
}

function getMarketById(marketId) {
  return MARKET_UNIVERSE.find(market => String(market.id) === String(marketId)) || null;
}

async function loadPolymarketMarketUniverse(options = {}) {
  const targetLimit = clampNumber(Number(options.limit) || 1800, 200, 12000);
  const pageSize = clampNumber(Number(options.pageSize) || 500, 200, 500);
  const maxPages = clampNumber(Number(options.maxPages) || 6, 1, 24);

  let mapped = [];
  let primaryError = null;

  try {
    mapped = await loadMarketUniverseViaMarketsEndpoint({ targetLimit, pageSize, maxPages });
  } catch (error) {
    primaryError = error;
  }

  if (mapped.length < MIN_MARKETS_REQUIRED) {
    try {
      const eventMapped = await loadMarketUniverseViaEventsEndpoint({ targetLimit, pageSize, maxPages });
      if (eventMapped.length > mapped.length) {
        mapped = eventMapped;
      }
    } catch (eventError) {
      if (!primaryError) {
        primaryError = eventError;
      }
    }
  }

  if (mapped.length < MIN_MARKETS_REQUIRED) {
    const cached = readMarketUniverseCache();
    if (cached.length >= MIN_MARKETS_REQUIRED) {
      setMarketUniverse(cached);
      return { source: "cache", count: cached.length };
    }
    throw (primaryError || new Error("Polymarket returned too few markets."));
  }

  setMarketUniverse(mapped);
  writeMarketUniverseCache(mapped);
  return { source: "polymarket", count: mapped.length };
}

async function loadMarketUniverseViaMarketsEndpoint({ targetLimit, pageSize, maxPages }) {
  const aggregated = [];

  for (let page = 0; page < maxPages && aggregated.length < targetLimit; page += 1) {
    const offset = page * pageSize;
    const endpoint =
      `${POLYMARKET_MARKETS_ENDPOINT}?active=true&closed=false` +
      `&limit=${Math.round(pageSize)}&offset=${Math.round(offset)}&order=volumeNum&ascending=false`;

    const payload = await fetchJsonWithRetry(endpoint, {
      method: "GET",
      timeoutMs: 10000
    });

    if (!Array.isArray(payload)) {
      throw new Error("Polymarket markets payload is not an array.");
    }
    if (payload.length === 0) break;

    aggregated.push(...payload);
    if (payload.length < pageSize) break;
  }

  const dedupedRaw = dedupeMarketsById(aggregated);
  return dedupedRaw
    .map(mapPolymarketMarket)
    .filter(Boolean)
    .slice(0, targetLimit);
}

async function loadMarketUniverseViaEventsEndpoint({ targetLimit, pageSize, maxPages }) {
  const synthesized = [];

  for (let page = 0; page < maxPages && synthesized.length < targetLimit; page += 1) {
    const offset = page * pageSize;
    const endpoint =
      `${POLYMARKET_EVENTS_ENDPOINT}?active=true&closed=false` +
      `&limit=${Math.round(pageSize)}&offset=${Math.round(offset)}`;

    const payload = await fetchJsonWithRetry(endpoint, {
      method: "GET",
      timeoutMs: 10000
    });

    if (!Array.isArray(payload)) {
      throw new Error("Polymarket events payload is not an array.");
    }
    if (payload.length === 0) break;

    for (const event of payload) {
      const markets = Array.isArray(event?.markets) ? event.markets : [];
      for (const market of markets) {
        if (!market || market.active === false || market.closed === true) continue;
        synthesized.push({
          ...market,
          events: [event]
        });
      }
    }

    if (payload.length < pageSize) break;
  }

  const dedupedRaw = dedupeMarketsById(synthesized);
  return dedupedRaw
    .map(mapPolymarketMarket)
    .filter(Boolean)
    .slice(0, targetLimit);
}

async function warmExpandedMarketUniverse(options = {}) {
  const limit = clampNumber(Number(options.limit) || 9000, 200, 12000);
  const maxPages = clampNumber(Number(options.maxPages) || 20, 1, 24);
  try {
    return await loadPolymarketMarketUniverse({
      limit,
      pageSize: 500,
      maxPages
    });
  } catch {
    return null;
  }
}

function shouldAttemptExpandedMarketLoad() {
  return !EXTENDED_MARKET_UNIVERSE_DONE && !EXTENDED_MARKET_UNIVERSE_PROMISE;
}

async function ensureExpandedMarketUniverseLoaded() {
  if (EXTENDED_MARKET_UNIVERSE_DONE) {
    return;
  }
  if (EXTENDED_MARKET_UNIVERSE_PROMISE) {
    await EXTENDED_MARKET_UNIVERSE_PROMISE;
    return;
  }

  EXTENDED_MARKET_UNIVERSE_PROMISE = (async () => {
    try {
      await warmExpandedMarketUniverse({
        limit: MAX_EXPANDED_MARKET_LIMIT,
        maxPages: MAX_EXPANDED_MARKET_PAGES
      });
    } catch {
      // Keep strict matcher behavior even if expanded load fails.
    } finally {
      EXTENDED_MARKET_UNIVERSE_DONE = true;
      EXTENDED_MARKET_UNIVERSE_PROMISE = null;
    }
  })();

  await EXTENDED_MARKET_UNIVERSE_PROMISE;
}

function dedupeMarketsById(rawMarkets) {
  const byId = new Map();
  for (const market of rawMarkets) {
    const id = String(market?.id ?? market?.conditionId ?? "");
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, market);
    }
  }
  return [...byId.values()];
}

function mapPolymarketMarket(raw) {
  if (!raw || typeof raw !== "object") return null;

  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (!question) return null;

  const events = Array.isArray(raw.events) ? raw.events : [];
  const firstEvent = events[0] && typeof events[0] === "object" ? events[0] : null;
  const eventTitle = typeof firstEvent?.title === "string" ? firstEvent.title : "";
  const eventSlug = typeof firstEvent?.slug === "string" ? firstEvent.slug : "";
  const eventDescription = typeof firstEvent?.description === "string" ? firstEvent.description : "";
  const eventContextDescription =
    typeof firstEvent?.eventMetadata?.context_description === "string"
      ? firstEvent.eventMetadata.context_description
      : "";
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const category = typeof raw.category === "string" ? raw.category : "";
  const description = typeof raw.description === "string" ? raw.description : "";
  const ticker = typeof raw.ticker === "string"
    ? raw.ticker
    : (typeof firstEvent?.ticker === "string" ? firstEvent.ticker : "");
  const eventTags = extractEventTagLabels(firstEvent);
  const urlSlug = eventSlug || slug;

  const odds = parseYesNoOdds(raw.outcomes, raw.outcomePrices);
  const volumeValue = Number(raw.volumeNum ?? raw.volume ?? raw.volume24hr ?? 0);

  return {
    id: String(raw.id ?? raw.conditionId ?? slug ?? question),
    question,
    yesOdds: odds.yesOdds,
    noOdds: odds.noOdds,
    volume: formatVolumeShort(volumeValue),
    keywords: buildSeedKeywords({
      question,
      slug,
      category,
      eventTitle,
      description,
      eventDescription,
      eventContextDescription,
      ticker,
      eventTags
    }),
    relatedMarkets: [],
    category,
    slug,
    eventTitle,
    polymarketUrl: urlSlug ? `https://polymarket.com/event/${urlSlug}` : "https://polymarket.com",
    description,
    eventDescription,
    eventContextDescription,
    ticker,
    eventTags
  };
}

function buildSeedKeywords({
  question,
  slug,
  category,
  eventTitle,
  description,
  eventDescription,
  eventContextDescription,
  ticker,
  eventTags
}) {
  const seeds = [
    question,
    eventTitle,
    slug ? slug.replace(/-/g, " ") : "",
    category ? category.replace(/-/g, " ") : "",
    ticker ? ticker.replace(/[-_]/g, " ") : "",
    ...(Array.isArray(eventTags) ? eventTags : [])
  ]
    .map(normalizeForMatch)
    .filter(Boolean);

  const questionPhrases = extractQuestionPhrases(question);
  const shortContextPhrases = [
    description,
    eventDescription,
    eventContextDescription
  ]
    .filter(value => typeof value === "string" && value.trim().length > 0)
    .map(value => normalizeForMatch(value).slice(0, 180))
    .filter(Boolean)
    .slice(0, 2);

  return [...new Set([...seeds, ...questionPhrases, ...shortContextPhrases])].slice(0, 56);
}

function extractEventTagLabels(firstEvent) {
  if (!firstEvent || !Array.isArray(firstEvent.tags)) {
    return [];
  }

  const labels = [];
  for (const tag of firstEvent.tags) {
    if (!tag || typeof tag !== "object") continue;
    if (typeof tag.label === "string" && tag.label.trim()) {
      labels.push(tag.label);
      continue;
    }
    if (typeof tag.name === "string" && tag.name.trim()) {
      labels.push(tag.name);
      continue;
    }
    if (typeof tag.slug === "string" && tag.slug.trim()) {
      labels.push(tag.slug.replace(/-/g, " "));
    }
  }
  return labels;
}

function rankFrequentTokens(tokens, maxItems = 24) {
  const frequency = new Map();
  for (const token of tokens) {
    if (!token || token.length < 4) continue;
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxItems)
    .map(([token]) => token);
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
    .flatMap(expandCompositeToken)
    .filter(token => token.length > 1 && !MATCH_STOP_WORDS.has(token) && !isPureNumberToken(token) && !isNoisyMixedToken(token))
    .filter(token => !isLikelyTweetAgeToken(token))
    .map(stemToken)
    .filter(token => token.length > 1 && !STEMMED_MATCH_STOP_WORDS.has(token) && !isPureNumberToken(token) && !isNoisyMixedToken(token))
    .filter(token => !isLikelyTweetAgeToken(token));
}

function tokenizeForSearchQuery(text) {
  return normalizeForMatch(text)
    .split(" ")
    .flatMap(expandCompositeToken)
    .map(token => token.trim().replace(/^\$+/, ""))
    .map(token => TOKEN_CANONICAL_MAP.get(token) || token)
    .filter(token => token.length >= 3 && !SEARCH_QUERY_STOP_WORDS.has(token) && !/^\d+$/.test(token) && !isNoisyMixedToken(token))
    .filter(token => !isLikelyTweetAgeToken(token));
}

function expandCompositeToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return [];
  if (!/[._-]/.test(normalized) || !/[a-z]/.test(normalized)) {
    return [normalized];
  }

  const pieces = normalized.split(/[._-]+/g).filter(Boolean);
  if (pieces.length === 0) return [normalized];
  const joined = pieces.join("");
  return uniquePreserveOrder([
    normalized,
    ...pieces,
    joined
  ]).filter(Boolean);
}

function stemTokenCore(token) {
  let result = String(token || "").replace(/^\$+/, "");
  if (result.endsWith("ies") && result.length > 4) {
    result = result.slice(0, -3) + "y";
  }
  if (result.endsWith("ing") && result.length > 5) {
    result = result.slice(0, -3);
  }
  if (result.endsWith("ed") && result.length > 4) {
    result = result.slice(0, -2);
  }
  if (result.endsWith("s") && result.length > 3) {
    result = result.slice(0, -1);
  }
  return result;
}

function stemToken(token) {
  const result = stemTokenCore(token);
  return TOKEN_CANONICAL_MAP.get(result) || result;
}

function isPureNumberToken(token) {
  if (!/^\d+$/.test(token)) return false;
  const numeric = Number(token);
  if (token.length >= 4 || numeric >= 100) {
    return false;
  }
  return true;
}

function isNoisyMixedToken(token) {
  const normalized = String(token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return false;
  const hasLetters = /[a-z]/.test(normalized);
  const hasDigits = /\d/.test(normalized);
  if (!hasLetters || !hasDigits) return false;
  // Keep well-known short alnum entities (gpt5, xai, etc.), drop long engagement/hash noise.
  if (normalized.length <= 6) return false;
  return true;
}

function isLikelyTweetAgeToken(token) {
  const normalized = String(token || "").toLowerCase();
  // X/Twitter age marker like "2h", "13h", "1hr", "4hrs"
  return /^\d{1,2}h(r|rs)?$/.test(normalized);
}

function isPrefixVariant(left, right) {
  if (!left || !right) return false;
  const minLen = Math.min(left.length, right.length);
  if (minLen < 5) return false;
  return left.startsWith(right.slice(0, minLen - 1)) || right.startsWith(left.slice(0, minLen - 1));
}

function withinEditDistanceOne(left, right) {
  if (left === right) return true;
  const lenA = left.length;
  const lenB = right.length;
  if (Math.abs(lenA - lenB) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < lenA && j < lenB) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (lenA > lenB) {
      i += 1;
    } else if (lenB > lenA) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  if (i < lenA || j < lenB) {
    edits += 1;
  }
  return edits <= 1;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (typeof window !== "undefined") {
  window.loadPolymarketMarketUniverse = loadPolymarketMarketUniverse;
  window.warmExpandedMarketUniverse = warmExpandedMarketUniverse;
  window.getMarketUniverse = getMarketUniverse;
  window.getMarketById = getMarketById;
}
