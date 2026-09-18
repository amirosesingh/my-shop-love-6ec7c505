import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function sqlFiles(directory = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if ([".git", "node_modules", ".output", ".wrangler"].includes(entry)) continue;
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) files.push(...sqlFiles(absolute));
    else if (entry.endsWith(".sql")) files.push(relative(root, absolute).replaceAll("\\\\", "/"));
  }
  return files.sort();
}

describe("canonical Supabase SQL", () => {
  it("keeps only the online installer and deliberate reset", () => {
    expect(sqlFiles()).toEqual(["supabase/reset.sql", "supabase/schema.sql"]);
  });

  it("contains the complete schema and enforces RLS on every app table", () => {
    const sql = read("supabase/schema.sql");
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/gi)].map(
      (match) => match[1],
    );
    expect(tables.length).toBeGreaterThan(60);
    for (const table of tables) {
      expect(sql, `${table} must enable RLS`).toMatch(
        new RegExp(`ALTER TABLE(?: ONLY)? public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      );
    }
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.schema_inventory_deep()");
    expect(sql).toContain("Retail schema refused: RLS is disabled for");
    expect(sql).toContain("FUNCTION public.pos_sale_commit");
  });

  it("resets data transactionally and restores RLS before commit", () => {
    const sql = read("supabase/reset.sql");
    expect(sql).toMatch(/BEGIN;[\s\S]*DISABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/DISABLE ROW LEVEL SECURITY[\s\S]*DELETE FROM/);
    expect(sql).toMatch(/DELETE FROM[\s\S]*ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/RLS was not restored[\s\S]*COMMIT;/);
    expect(sql).not.toMatch(/DROP (?:TABLE|SCHEMA|POLICY)/i);
  });
});
