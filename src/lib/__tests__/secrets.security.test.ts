import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The repository is pushed to GitHub, so no private credential may ever be
 * committed. Publishable keys (`sb_publishable_…`) are allowed by design.
 */
const ROOTS = ["src", "electron", "scripts", "docs"];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "Supabase service-role key", pattern: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "JWT-shaped credential", pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: "hardcoded service_role literal", pattern: /service_role["']?\s*[:=]\s*["'][^"']{20,}/ },
];

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(files(full));
    else if (/\.(ts|tsx|js|cjs|mjs|json|md|sql)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no committed credentials", () => {
  it("keeps private keys out of the repository", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(root)) {
        if (file.endsWith("secrets.security.test.ts")) continue;
        const text = readFileSync(file, "utf8");
        for (const rule of FORBIDDEN) {
          if (rule.pattern.test(text)) offenders.push(`${file}: ${rule.name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});