/**
 * Offline evaluation harness for the market-matching pipeline.
 *
 * Usage:
 *   npx tsx tests/eval/run_eval.ts [--api-url http://localhost:8787]
 *
 * Reads test_cases.jsonl, calls /v1/match-market for each case,
 * and reports precision@1, no-match precision, recall@1, and FPR.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestCase {
  id: string;
  tweet_text: string;
  media_assets: { type: string; url?: string; alt_text?: string }[];
  expected_match: boolean;
  expected_match_keywords: string[];
  expected_market_substring?: string;
  notes: string;
}

interface MatchResponse {
  matched_market_id: string | null;
  should_show: boolean;
  confidence_score: number;
  rationale: string;
  key_terms: string[];
  model_mode: string;
}

interface SearchResponse {
  queries: string[];
  key_terms: string[];
  rationale: string;
  model_mode: string;
}

interface CandidateMarket {
  id: string;
  question: string;
  category?: string;
  eventTitle?: string;
}

// ── Config ────────────────────────────────────────────────
const API_URL = process.argv.find((arg) => arg.startsWith("--api-url="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--api-url") + 1]
  ?? "http://localhost:8787";
const MATCH_ENDPOINT = `${API_URL}/v1/match-market`;
const QUERY_ENDPOINT = `${API_URL}/v1/extract-market-query`;
const POLYMARKET_SEARCH = "https://gamma-api.polymarket.com/public-search";

// ── Helpers ───────────────────────────────────────────────
function loadTestCases(): TestCase[] {
  const raw = readFileSync(resolve(__dirname, "test_cases.jsonl"), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TestCase);
}

async function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  const init: RequestInit = body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : { method: "GET" };
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function searchPolymarket(query: string): Promise<CandidateMarket[]> {
  try {
    const data = await fetchJson<{ events?: { markets?: Record<string, unknown>[] }[] }>(
      `${POLYMARKET_SEARCH}?q=${encodeURIComponent(query)}`,
    );
    const markets: CandidateMarket[] = [];
    for (const event of data.events ?? []) {
      for (const m of event.markets ?? []) {
        if (m.active === false || m.closed === true) continue;
        const id = String(m.condition_id ?? m.id ?? "");
        const question = String(m.question ?? "");
        if (!id || !question) continue;
        markets.push({
          id,
          question,
          category: typeof m.category === "string" ? m.category : undefined,
          eventTitle: typeof m.eventTitle === "string" ? m.eventTitle : undefined,
        });
      }
    }
    return markets;
  } catch {
    return [];
  }
}

async function getQueriesForTweet(tc: TestCase): Promise<string[]> {
  try {
    const result = await fetchJson<SearchResponse>(QUERY_ENDPOINT, {
      tweet_text: tc.tweet_text,
      media_assets: tc.media_assets,
      max_queries: 4,
    });
    return result.queries ?? [];
  } catch {
    // If query endpoint is unavailable, build a naive query from keywords
    const words = tc.tweet_text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
    return [words.slice(0, 4).join(" ")].filter(Boolean);
  }
}

// ── Eval loop ─────────────────────────────────────────────
interface EvalResult {
  id: string;
  expected_match: boolean;
  got_match: boolean;
  pass: boolean;
  confidence: number;
  matched_question: string;
  rationale: string;
  queries_used: string[];
  candidate_count: number;
  notes: string;
}

async function evaluateCase(tc: TestCase): Promise<EvalResult> {
  // Step 1: generate queries
  const queries = await getQueriesForTweet(tc);

  // Step 2: search Polymarket for candidates
  const allCandidates: CandidateMarket[] = [];
  const seenIds = new Set<string>();
  const searchBatches = await Promise.all(
    queries.slice(0, 4).map((q) => searchPolymarket(q)),
  );
  for (const results of searchBatches) {
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allCandidates.push(r);
      }
    }
  }

  // Step 3: call match-market
  let matchResult: MatchResponse;
  if (allCandidates.length === 0) {
    matchResult = {
      matched_market_id: null,
      should_show: false,
      confidence_score: 0,
      rationale: "No candidates found from search.",
      key_terms: [],
      model_mode: "skip",
    };
  } else {
    matchResult = await fetchJson<MatchResponse>(MATCH_ENDPOINT, {
      tweet_text: tc.tweet_text,
      candidates: allCandidates.slice(0, 25),
      media_assets: tc.media_assets,
    });
  }

  const gotMatch = matchResult.should_show && matchResult.matched_market_id !== null;
  const matchedCandidate = gotMatch
    ? allCandidates.find((c) => c.id === matchResult.matched_market_id)
    : null;

  let pass: boolean;
  if (tc.expected_match) {
    // Expected a match: check that we got one and it contains the expected substring
    if (!gotMatch) {
      pass = false;
    } else if (tc.expected_market_substring && matchedCandidate) {
      pass = matchedCandidate.question.toLowerCase().includes(tc.expected_market_substring.toLowerCase());
    } else {
      pass = gotMatch;
    }
  } else {
    // Expected no match
    pass = !gotMatch;
  }

  return {
    id: tc.id,
    expected_match: tc.expected_match,
    got_match: gotMatch,
    pass,
    confidence: matchResult.confidence_score,
    matched_question: matchedCandidate?.question ?? "(none)",
    rationale: matchResult.rationale,
    queries_used: queries,
    candidate_count: allCandidates.length,
    notes: tc.notes,
  };
}

// ── Main ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const cases = loadTestCases();
  console.log(`\nRunning eval: ${cases.length} test cases against ${API_URL}\n`);
  console.log("─".repeat(90));

  const results: EvalResult[] = [];
  for (const tc of cases) {
    process.stdout.write(`  ${tc.id}: `);
    try {
      const result = await evaluateCase(tc);
      results.push(result);
      const icon = result.pass ? "PASS" : "FAIL";
      const detail = result.got_match
        ? `matched (${result.confidence}%) "${result.matched_question.slice(0, 50)}"`
        : "no match";
      console.log(`${icon}  ${detail}`);
      if (!result.pass) {
        console.log(`         expected_match=${tc.expected_match}, got_match=${result.got_match}`);
        console.log(`         rationale: ${result.rationale}`);
        console.log(`         queries: ${result.queries_used.join(" | ")}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`ERROR  ${msg}`);
      results.push({
        id: tc.id,
        expected_match: tc.expected_match,
        got_match: false,
        pass: false,
        confidence: 0,
        matched_question: "(error)",
        rationale: msg,
        queries_used: [],
        candidate_count: 0,
        notes: tc.notes,
      });
    }
  }

  // ── Metrics ───────────────────────────────────────────
  console.log("\n" + "─".repeat(90));
  console.log("METRICS\n");

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  const expectMatch = results.filter((r) => r.expected_match);
  const expectNoMatch = results.filter((r) => !r.expected_match);

  const truePositives = expectMatch.filter((r) => r.got_match && r.pass).length;
  const falseNegatives = expectMatch.filter((r) => !r.got_match).length;
  const trueNegatives = expectNoMatch.filter((r) => !r.got_match).length;
  const falsePositives = expectNoMatch.filter((r) => r.got_match).length;

  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;
  const noMatchPrecision = trueNegatives + falseNegatives > 0
    ? trueNegatives / (trueNegatives + falseNegatives)
    : 0;
  const fpr = trueNegatives + falsePositives > 0
    ? falsePositives / (trueNegatives + falsePositives)
    : 0;

  console.log(`  Total cases:          ${total}`);
  console.log(`  Passed:               ${passed} / ${total} (${(100 * passed / total).toFixed(1)}%)`);
  console.log(`  Precision@1:          ${precision.toFixed(3)}  (target >= 0.850)`);
  console.log(`  Recall@1:             ${recall.toFixed(3)}`);
  console.log(`  No-match precision:   ${noMatchPrecision.toFixed(3)}`);
  console.log(`  False positive rate:  ${fpr.toFixed(3)}  (target <= 0.100)`);
  console.log(`  True positives:       ${truePositives}`);
  console.log(`  False positives:      ${falsePositives}`);
  console.log(`  True negatives:       ${trueNegatives}`);
  console.log(`  False negatives:      ${falseNegatives}`);

  // ── Regression checklist ──────────────────────────────
  console.log("\n" + "─".repeat(90));
  console.log("REGRESSION CHECKLIST\n");

  const noMatchFailures = expectNoMatch.filter((r) => r.got_match);
  const matchFailures = expectMatch.filter((r) => !r.pass);

  console.log(`  [${noMatchFailures.length === 0 ? "✓" : "✗"}] All expected_match=false cases correctly rejected (${noMatchFailures.length} failures)`);
  for (const f of noMatchFailures) {
    console.log(`      FAIL ${f.id}: matched "${f.matched_question.slice(0, 60)}" (conf=${f.confidence})`);
  }

  console.log(`  [${matchFailures.length === 0 ? "✓" : "✗"}] All expected_match=true cases correctly matched (${matchFailures.length} failures)`);
  for (const f of matchFailures) {
    console.log(`      FAIL ${f.id}: ${f.got_match ? "wrong market" : "no match returned"}`);
  }

  console.log(`  [${precision >= 0.85 ? "✓" : "✗"}] Precision@1 >= 0.850 (actual: ${precision.toFixed(3)})`);
  console.log(`  [${fpr <= 0.10 ? "✓" : "✗"}] False positive rate <= 0.100 (actual: ${fpr.toFixed(3)})`);

  console.log("\n" + "─".repeat(90));

  // Exit with error code if any regression check fails
  if (noMatchFailures.length > 0 || precision < 0.85 || fpr > 0.10) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Eval runner failed:", error);
  process.exitCode = 1;
});
