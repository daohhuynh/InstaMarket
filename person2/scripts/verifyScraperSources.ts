import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Source = "x" | "youtube" | "reddit" | "news" | "google" | "tiktok";

interface VerificationCase {
  name: string;
  enabled: Source[];
}

interface DossierLike {
  source_counts?: Record<string, number>;
  collection_errors?: Array<{ source_type?: string; error?: string }>;
}

const CASES: VerificationCase[] = [
  { name: "all", enabled: ["x", "youtube", "reddit", "news", "google", "tiktok"] },
  { name: "x-only", enabled: ["x"] },
  { name: "youtube-only", enabled: ["youtube"] },
  { name: "reddit-only", enabled: ["reddit"] },
  { name: "news-only", enabled: ["news"] },
  { name: "google-only", enabled: ["google"] },
  { name: "tiktok-only", enabled: ["tiktok"] },
];

const ALL_SOURCES: Source[] = ["x", "youtube", "reddit", "news", "google", "tiktok"];

async function main(): Promise<void> {
  const cwd = process.cwd();
  const outDir = resolve(cwd, "output", "verification");
  const inputFile = resolve(cwd, "examples", "iran_market_research_input.json");
  await mkdir(outDir, { recursive: true });

  process.stdout.write("Running scraper source verification...\n");
  process.stdout.write(`Input: ${inputFile}\n`);

  for (const testCase of CASES) {
    const outputFile = resolve(outDir, `verify_${testCase.name}.json`);
    const args = [
      "-m",
      "signalmarket_scrapers",
      "--market-research-file",
      inputFile,
      "--output",
      outputFile,
      "--max-items-per-source",
      "3",
      ...buildDisableFlags(testCase.enabled),
    ];

    const result = await runPython(args);
    if (!result.ok) {
      process.stdout.write(`\n[${testCase.name}] process failed: ${result.error}\n`);
      continue;
    }

    const dossier = await readDossier(outputFile);
    const counts = dossier.source_counts ?? {};
    const errors = Array.isArray(dossier.collection_errors) ? dossier.collection_errors : [];
    const enabledSummary = testCase.enabled.map((source) => `${source}=${counts[source] ?? 0}`).join(", ");
    process.stdout.write(`\n[${testCase.name}] ${enabledSummary}\n`);
    if (errors.length > 0) {
      for (const error of errors.slice(0, 5)) {
        process.stdout.write(`  error ${String(error.source_type ?? "unknown")}: ${String(error.error ?? "unknown")}\n`);
      }
    } else {
      process.stdout.write("  errors: none\n");
    }
  }

  process.stdout.write("\nScraper verification completed.\n");
}

function buildDisableFlags(enabled: Source[]): string[] {
  const disabled = ALL_SOURCES.filter((source) => !enabled.includes(source));
  return disabled.map((source) => `--disable-${source}`);
}

async function runPython(args: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = { ...process.env };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.all_proxy;
  env.NO_PROXY = "*";
  env.PYTHONDONTWRITEBYTECODE = "1";

  const preferredPython = (process.env.SCRAPER_PYTHON_BIN ?? "").trim();
  const interpreters = [...new Set([preferredPython, "python3", "python", "py"].filter((value) => value.length > 0))];

  let lastResult: { ok: true } | { ok: false; error: string } = {
    ok: false,
    error: "No Python interpreter candidates were provided.",
  };

  for (const interpreter of interpreters) {
    const result = await runCommand(interpreter, args, env);
    if (result.ok) {
      return result;
    }
    lastResult = result;
  }

  return lastResult;
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolvePromise({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ ok: true });
        return;
      }
      resolvePromise({
        ok: false,
        error: `exit=${code} ${stderr.slice(0, 300)}`,
      });
    });
  });
}

async function readDossier(path: string): Promise<DossierLike> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as DossierLike;
  } catch {
    return {};
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify-scrapers failed: ${message}\n`);
  process.exitCode = 1;
});
