import { existsSync, readFileSync } from "node:fs";

let loaded = false;

export function loadLocalEnvFiles(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  for (const filePath of [".env.local", ".env", "../.env.local", "../.env"]) {
    if (!existsSync(filePath)) {
      continue;
    }

    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim());
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = value;
    }
  }
}

function stripWrappingQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
