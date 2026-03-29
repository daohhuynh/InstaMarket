import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface SkillSpec {
  id: "market_analyst" | "evidence_analyst" | "resolution_analyst" | "pm_synthesizer";
  relativePath: string;
  fallback: string;
}

export type LoadedSkills = Record<SkillSpec["id"], string>;

const SKILL_SPECS: SkillSpec[] = [
  {
    id: "market_analyst",
    relativePath: "agents/market-analyst/skills.md",
    fallback:
      "You are a market analyst. Infer fair odds from live prices, market structure, and event timing. Keep uncertainty explicit.",
  },
  {
    id: "evidence_analyst",
    relativePath: "agents/evidence-analyst/skills.md",
    fallback:
      "You are an evidence analyst. Extract high-signal claims from cross-platform sources and separate facts from sentiment.",
  },
  {
    id: "resolution_analyst",
    relativePath: "agents/resolution-analyst/skills.md",
    fallback:
      "You are a resolution analyst. Focus on rule interpretation, ambiguity, and what evidence would or would not resolve the market.",
  },
  {
    id: "pm_synthesizer",
    relativePath: "agents/pm-synthesizer/skills.md",
    fallback:
      "You are a portfolio manager synthesizer. Convert analyst notes into a clear trade recommendation with sizing and stop loss discipline.",
  },
];

export async function loadAnalystSkills(cwd: string = process.cwd()): Promise<LoadedSkills> {
  const entries = await Promise.all(SKILL_SPECS.map(async (spec) => [spec.id, await loadSkillText(cwd, spec)] as const));
  return Object.fromEntries(entries) as LoadedSkills;
}

async function loadSkillText(cwd: string, spec: SkillSpec): Promise<string> {
  const absolutePath = resolve(cwd, spec.relativePath);
  try {
    const raw = await readFile(absolutePath, "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : spec.fallback;
  } catch {
    return spec.fallback;
  }
}
