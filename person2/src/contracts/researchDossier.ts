export type EvidenceSourceType = "x" | "youtube" | "reddit" | "news" | "google" | "tiktok";

export interface ResearchDossierMarket {
  market_id?: string;
  question: string;
  url?: string;
  resolution_date?: string;
  market_context?: string;
  resolution_criteria?: string;
  x_post_url?: string;
  queries: string[];
}

export interface ResearchSourceRecord {
  id: string;
  source_type: EvidenceSourceType;
  provider: string;
  query: string;
  title: string;
  url: string;
  author?: string;
  published_at?: string;
  snippet: string;
  raw_text: string;
  relevance_score: number;
  engagement: Record<string, number>;
}

export interface ResearchDossier {
  report_id: string;
  generated_at: string;
  market: ResearchDossierMarket;
  briefing_lines: string[];
  source_counts: Partial<Record<EvidenceSourceType, number>>;
  sources: ResearchSourceRecord[];
  collection_errors?: Array<{
    source_type: string;
    error: string;
  }>;
}

const EVIDENCE_SOURCE_TYPES: EvidenceSourceType[] = ["x", "youtube", "reddit", "news", "google", "tiktok"];
const PROMPT_SOURCE_PRIORITY: EvidenceSourceType[] = ["news", "google", "x", "youtube", "reddit", "tiktok"];

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEvidenceSourceType(value: unknown): value is EvidenceSourceType {
  return typeof value === "string" && EVIDENCE_SOURCE_TYPES.includes(value as EvidenceSourceType);
}

export function validateResearchDossier(value: unknown): asserts value is ResearchDossier {
  assert(isObject(value), "research_dossier must be an object");
  assert(isString(value.report_id) && value.report_id.length > 0, "research_dossier.report_id is required");
  assert(isString(value.generated_at) && value.generated_at.length > 0, "research_dossier.generated_at is required");

  assert(isObject(value.market), "research_dossier.market must be an object");
  assert(isString(value.market.question) && value.market.question.length > 0, "research_dossier.market.question is required");
  assert(Array.isArray(value.market.queries), "research_dossier.market.queries must be an array");
  for (const query of value.market.queries) {
    assert(isString(query) && query.length > 0, "research_dossier.market.queries entries must be strings");
  }

  assert(Array.isArray(value.briefing_lines), "research_dossier.briefing_lines must be an array");
  for (const line of value.briefing_lines) {
    assert(isString(line), "research_dossier.briefing_lines entries must be strings");
  }

  assert(isObject(value.source_counts), "research_dossier.source_counts must be an object");
  for (const [key, count] of Object.entries(value.source_counts)) {
    assert(isEvidenceSourceType(key), `research_dossier.source_counts.${key} is not a supported source type`);
    assert(isFiniteNumber(count) && count >= 0, `research_dossier.source_counts.${key} must be >= 0`);
  }

  assert(Array.isArray(value.sources), "research_dossier.sources must be an array");
  for (const [index, source] of value.sources.entries()) {
    assert(isObject(source), `research_dossier.sources[${index}] must be an object`);
    assert(isString(source.id) && source.id.length > 0, `research_dossier.sources[${index}].id is required`);
    assert(
      isEvidenceSourceType(source.source_type),
      `research_dossier.sources[${index}].source_type must be one of ${EVIDENCE_SOURCE_TYPES.join(", ")}`,
    );
    assert(isString(source.provider) && source.provider.length > 0, `research_dossier.sources[${index}].provider is required`);
    assert(isString(source.query) && source.query.length > 0, `research_dossier.sources[${index}].query is required`);
    assert(isString(source.title) && source.title.length > 0, `research_dossier.sources[${index}].title is required`);
    assert(isString(source.url) && source.url.length > 0, `research_dossier.sources[${index}].url is required`);
    assert(isString(source.snippet), `research_dossier.sources[${index}].snippet must be a string`);
    assert(isString(source.raw_text) && source.raw_text.length > 0, `research_dossier.sources[${index}].raw_text is required`);
    assert(
      isFiniteNumber(source.relevance_score) && source.relevance_score >= 0 && source.relevance_score <= 1,
      `research_dossier.sources[${index}].relevance_score must be between 0 and 1`,
    );
    assert(isObject(source.engagement), `research_dossier.sources[${index}].engagement must be an object`);
    for (const [metric, metricValue] of Object.entries(source.engagement)) {
      assert(
        isFiniteNumber(metricValue) && metricValue >= 0,
        `research_dossier.sources[${index}].engagement.${metric} must be >= 0`,
      );
    }
  }

  if (value.collection_errors !== undefined) {
    assert(Array.isArray(value.collection_errors), "research_dossier.collection_errors must be an array when provided");
    for (const [index, item] of value.collection_errors.entries()) {
      assert(isObject(item), `research_dossier.collection_errors[${index}] must be an object`);
      assert(isString(item.source_type), `research_dossier.collection_errors[${index}].source_type must be a string`);
      assert(isString(item.error), `research_dossier.collection_errors[${index}].error must be a string`);
    }
  }
}

export function formatResearchDossierForPrompt(dossier: ResearchDossier, maxSources = 6): string {
  const lines: string[] = [
    `External evidence report generated at: ${dossier.generated_at}`,
    `External evidence queries: ${dossier.market.queries.join(" | ")}`,
  ];

  const sourceCounts = EVIDENCE_SOURCE_TYPES.map((sourceType) => `${sourceType}=${dossier.source_counts[sourceType] ?? 0}`).join(", ");
  lines.push(`External evidence counts: ${sourceCounts}`);

  if (dossier.market.market_context) {
    lines.push(`External market context: ${compact(dossier.market.market_context, 320)}`);
  }

  if (dossier.market.resolution_criteria) {
    lines.push(`Resolution criteria: ${compact(dossier.market.resolution_criteria, 320)}`);
  }

  if (dossier.briefing_lines.length > 0) {
    lines.push("External briefing lines:");
    for (const line of dossier.briefing_lines.slice(0, 6)) {
      lines.push(`- ${compact(line, 220)}`);
    }
  }

  const topSources = selectPromptSources(dossier, maxSources);

  if (topSources.length > 0) {
    lines.push("Top external sources:");
    for (const source of topSources) {
      const snippet = compact(source.snippet || source.raw_text, 180);
      lines.push(`- [${source.source_type}] ${compact(source.title, 110)} | ${snippet} | ${source.url}`);
    }
  }

  return lines.join("\n");
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function selectPromptSources(dossier: ResearchDossier, maxSources: number): ResearchSourceRecord[] {
  const selected: ResearchSourceRecord[] = [];

  for (const sourceType of PROMPT_SOURCE_PRIORITY) {
    const topForSource = dossier.sources
      .filter((source) => source.source_type === sourceType)
      .sort((left, right) => right.relevance_score - left.relevance_score)[0];

    if (topForSource) {
      selected.push(topForSource);
    }

    if (selected.length >= maxSources) {
      return selected;
    }
  }

  if (selected.length >= maxSources) {
    return selected;
  }

  const selectedIds = new Set(selected.map((source) => source.id));
  for (const source of [...dossier.sources].sort((left, right) => right.relevance_score - left.relevance_score)) {
    if (selectedIds.has(source.id)) {
      continue;
    }
    selected.push(source);
    if (selected.length >= maxSources) {
      break;
    }
  }

  return selected;
}
