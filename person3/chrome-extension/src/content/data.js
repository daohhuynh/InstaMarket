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
  "into", "out", "up", "down", "over", "under", "just", "now",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "today", "yesterday", "tomorrow", "week", "month", "year", "day", "night",
  "post", "tweet", "thread", "reply", "context", "reader", "people", "person",
  "news", "story", "update", "market", "odds", "bet", "yes", "no", "true", "false",
  "email", "gmail", "http", "https", "www", "com"
]);

const TOKEN_CANONICAL_MAP = new Map([
  ["gpt-5", "gpt5"],
  ["gpt5", "gpt5"],
  ["chatgpt", "openai"],
  ["claude", "anthropic"],
  ["anthropic", "anthropic"],
  ["btc", "bitcoin"],
  ["bitcoin", "bitcoin"],
  ["eth", "ethereum"],
  ["ethereum", "ethereum"],
  ["fomc", "federalreserve"],
  ["fed", "federalreserve"],
  ["federal", "federalreserve"],
  ["reserve", "federalreserve"],
  ["tiktok", "tiktok"],
  ["bytedance", "tiktok"],
  ["xai", "xai"],
  ["openai", "openai"],
  ["tesla", "tesla"],
  ["musk", "musk"],
  ["elon", "musk"],
  ["trump", "trump"],
]);

const POLYMARKET_MARKETS_ENDPOINT = "https://gamma-api.polymarket.com/markets";
const AI_MARKET_MATCH_ENDPOINT_DEFAULT = "http://localhost:8787/v1/match-market";
const AI_MARKET_MATCH_LIMIT_PER_LOAD = 5;
const EXTENSION_JSON_FETCH_MESSAGE = "IM_FETCH_JSON";
const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const MIN_MARKETS_REQUIRED = 25;
const STRONG_MATCH_MIN_SCORE = 12;
const WEAK_MATCH_MIN_SCORE = 9.5;
const RARE_TOKEN_DF_RATIO = 0.035;
const VERY_RARE_TOKEN_DF_RATIO = 0.015;
const MAX_EXPANDED_MARKET_LIMIT = 9000;
const MAX_EXPANDED_MARKET_PAGES = 20;

let MARKET_UNIVERSE = [];
let MARKET_MATCH_INDEX = [];
let MARKET_TOKEN_DF = new Map();
let AI_MARKET_MATCH_USED = 0;
let EXTENDED_MARKET_UNIVERSE_PROMISE = null;
let EXTENDED_MARKET_UNIVERSE_DONE = false;
rebuildMarketMatchIndex();

function findBestMarketForTweet(tweetText) {
  const ranked = rankMarketCandidates(tweetText, 30);
  return selectParserMatchFromRanked(ranked, tweetText);
}

async function findBestMarketForTweetWithAi(tweetText) {
  let ranked = rankMarketCandidates(tweetText, 25);
  let parserMatch = selectParserMatchFromRanked(ranked, tweetText);

  if (!parserMatch && shouldAttemptExpandedMarketLoad()) {
    await ensureExpandedMarketUniverseLoaded();
    ranked = rankMarketCandidates(tweetText, 25);
    parserMatch = selectParserMatchFromRanked(ranked, tweetText);
  }

  if (!ranked.length || !parserMatch) {
    return null;
  }

  if (!shouldUseAiRerank()) {
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
  const aiConfidence = Number(aiResult.confidence_score) || 0;
  const hasStrongParserSupport = selectedScore >= 8 && selectedScore >= topParserScore * 0.55;
  const hasStrongAiSupport = aiConfidence >= 78 && selectedScore >= 5 && selectedScore >= topParserScore * 0.45;
  if (!hasStrongParserSupport && !hasStrongAiSupport) {
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

function selectParserMatchFromRanked(ranked, tweetText = "") {
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;

  const distinctMatches = new Set([...best.exactMatches, ...best.tokenMatches]).size;
  const margin = best.score - (second?.score || 0);
  const hasStrongSingleSignal = distinctMatches === 1 && best.score >= 12 && margin >= 3;
  const tweetTokens = tokenizeForMatch(tweetText);
  const tokenSignals = analyzeMatchSignals(best.tokenMatches, tweetTokens);
  const hasExactPhrase = best.exactMatches.length > 0;
  const hasAnchorSignals = tokenSignals.rareCount >= 2 || tokenSignals.veryRareCount >= 1;
  const hasStrongScore = best.score >= STRONG_MATCH_MIN_SCORE;
  const hasWeakScore = best.score >= WEAK_MATCH_MIN_SCORE && margin >= 2;

  if (!hasStrongScore && !hasWeakScore) return null;
  if (!hasExactPhrase && !hasAnchorSignals && !hasStrongSingleSignal) return null;
  if (distinctMatches < 2 && !hasStrongSingleSignal && !hasAnchorSignals) return null;
  if (margin < 1.5 && best.score < 14 && !hasAnchorSignals) return null;
  if (!tweetHasSufficientSignal(tweetTokens) && !hasExactPhrase) return null;

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
    const data = await fetchJsonWithExtensionSupport(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 4500
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

  const fallback = await fetchJsonDirect(url, options);
  if (!fallback.ok) {
    throw new Error(fallback.error || `Request failed (${fallback.status || 0})`);
  }
  return fallback.json;
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

function tweetHasSufficientSignal(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  const marketCount = Math.max(1, MARKET_MATCH_INDEX.length);
  let signalCount = 0;
  for (const token of tokens) {
    if (token.length < 4) continue;
    const df = MARKET_TOKEN_DF.get(token) || marketCount;
    const ratio = df / marketCount;
    if (ratio <= 0.25) {
      signalCount += 1;
    }
    if (signalCount >= 2) return true;
  }
  return false;
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
  const targetLimit = clampNumber(Number(options.limit) || 1800, 200, 12000);
  const pageSize = clampNumber(Number(options.pageSize) || 500, 200, 500);
  const maxPages = clampNumber(Number(options.maxPages) || 6, 1, 24);

  const fetchPromises = Array.from({ length: maxPages }).map((_, page) => {
    const offset = page * pageSize;
    const endpoint = `${POLYMARKET_MARKETS_ENDPOINT}?active=true&closed=false&limit=${pageSize}&offset=${offset}`;
    return fetch(endpoint).then(res => res.json()).catch(() => []);
  });

  const results = await Promise.all(fetchPromises);
  
  let aggregated = results.flat();
  
  if (aggregated.length > targetLimit) {
      aggregated = aggregated.slice(0, targetLimit);
  }

  setMarketUniverse(aggregated);
  return { count: aggregated.length };
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
  let result = token;
  if (token.endsWith("ies") && token.length > 4) {
    result = token.slice(0, -3) + "y";
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
  return TOKEN_CANONICAL_MAP.get(result) || result;
}

function isPureNumberToken(token) {
  return /^\d+$/.test(token);
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
