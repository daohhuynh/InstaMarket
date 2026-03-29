import test from "node:test";
import assert from "node:assert/strict";
import { formatResearchDossierForPrompt, validateResearchDossier } from "../src/contracts/researchDossier.js";

test("validateResearchDossier accepts normalized scraper output and formats prompt text", () => {
  const dossier = {
    report_id: "iran-brief-1",
    generated_at: "2026-03-28T23:30:00Z",
    market: {
      market_id: "market_1",
      question: "Will active US military personnel physically enter Iran by March 31, 2026?",
      url: "https://polymarket.com/event/example",
      resolution_date: "2026-03-31T23:59:59-04:00",
      market_context: "Pentagon reinforcements are moving into the Gulf, but no ground entry has been reported.",
      resolution_criteria: "Only deliberate terrestrial entry by active US military personnel counts.",
      queries: ["US military Iran ground incursion", "Trump Iran troops"],
    },
    briefing_lines: ["NEWS: No confirmed US ground entry into Iran as of March 28."],
    source_counts: {
      x: 2,
      youtube: 1,
      reddit: 1,
      news: 3,
      google: 2,
    },
    sources: [
      {
        id: "news_1",
        source_type: "news",
        provider: "google-news-rss",
        query: "US military Iran ground incursion",
        title: "US reinforces Gulf positions after strikes",
        url: "https://example.com/news/us-reinforces-gulf",
        author: "Example News",
        published_at: "2026-03-28T18:00:00Z",
        snippet: "Coverage says US reinforcements expanded regional posture but did not enter Iran.",
        raw_text: "US reinforcements expanded regional posture but did not enter Iran.",
        relevance_score: 0.88,
        engagement: {},
      },
    ],
  };

  validateResearchDossier(dossier);

  const promptText = formatResearchDossierForPrompt(dossier);
  assert.match(promptText, /External evidence counts: x=2, youtube=1, reddit=1, news=3, google=2/);
  assert.match(promptText, /Top external sources:/);
  assert.match(promptText, /US reinforces Gulf positions after strikes/);
});
