/**
 * This POS talks to the operator's own database only.
 *
 * Every read and write must go through `supabaseExternal` (their Supabase) or
 * the server relay that uses their service key. The Lovable-managed client is
 * generated into `src/integrations/supabase/` and must stay unimported by the
 * application, so it can never quietly become the store of record again.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const GENERATED = join(ROOT, "integrations", "supabase");

const FORBIDDEN = [
  /from\s+["']@\/integrations\/supabase\/client["']/,
  /from\s+["']@\/integrations\/supabase\/client\.server["']/,
  /from\s+["']@\/integrations\/supabase\/auth-middleware["']/,
  /from\s+["'](\.\.?\/)+integrations\/supabase\/client(\.server)?["']/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (full.startsWith(GENERATED)) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("database ownership", () => {
  it("no application file imports the Lovable-managed database client", () => {
    const offenders = walk(ROOT).filter((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN.some((pattern) => pattern.test(source));
    });
    expect(offenders).toEqual([]);
  });
});