/**
 * One-off integration test: Kharg Island tweet + Polymarket card from X (Mar 2026 example).
 * Run with bridge up: node server.js & node scripts/test-kharg-persona-sim.mjs
 */
const tweetText = `BREAKING NEWS 🚨  
Iranian forces have scripted a new history 🔥 🛑  

"Multiple US Marines have been arrested on Iran's Kharg Island, and this arrest was successfully carried out"  
Big development 🔥`;

const market = {
  id: "kharg-island-may31-example",
  question: "Kharg Island no longer under Iranian control by May 31?",
  yesOdds: 39,
  noOdds: 62,
  volume: "$45.1K Vol",
};

const url = process.env.PERSONA_SIM_URL || "http://127.0.0.1:3000/api/persona-sim";

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tweetText, market }),
});

const body = await res.json().catch(() => ({}));
console.log("HTTP", res.status);
if (!res.ok) {
  console.error(body);
  process.exit(1);
}

const {
  totalAgents,
  simulatedYesPct,
  simulatedNoPct,
  realYesPct,
  edgeVsMarket,
  decisions,
} = body;
console.log({
  totalAgents,
  simulatedYesPct,
  simulatedNoPct,
  realYesPct,
  edgeVsMarket,
  decisionSample: decisions?.slice(0, 3)?.map((d) => ({
    name: d.name,
    decision: d.decision,
    confidence: d.confidence,
  })),
});
