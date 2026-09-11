import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_PLANE_TABLES, OPERATIONAL_TABLES } from "../data-ownership";

const APPROVED_MUTATION_OWNERS = new Set([
  resolve(process.cwd(), "src/core/api/pos-db.ts"),
  resolve(process.cwd(), "src/lib/sync-engine.ts"),
  resolve(process.cwd(), "src/core/api/pos-relay.server.ts"),
]);

describe("data ownership", () => {
  it("keeps operational and control-plane ownership disjoint", () => {
    for (const table of OPERATIONAL_TABLES) expect(CONTROL_PLANE_TABLES.has(table)).toBe(false);
  });

  it("does not mutate operational tables directly from feature modules", () => {
    const offenders: string[] = [];
    const root = resolve(process.cwd(), "src");
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        if (APPROVED_MUTATION_OWNERS.has(full)) continue;
        const src = readFileSync(full, "utf8");
        for (const table of OPERATIONAL_TABLES) {
          const from = new RegExp(String.raw`\.from\(\s*["']${table}["']\s*\)[\s\S]{0,320}?\.(?:insert|upsert|update|delete)\s*\(`);
          if (from.test(src)) offenders.push(`${full} -> ${table}`);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
