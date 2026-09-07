import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("canonical POS rules contract", () => {
  it("never bypasses the versioned save RPC with a table upsert", () => {
    const server = read("src/lib/pos-rules.server.ts");
    expect(server).toContain("/rest/v1/rpc/pos_rules_save");
    expect(server).toContain("_expected_version: expectedVersion");
    expect(server).not.toContain('serviceRest("pos_store_settings?on_conflict=store_id"');
  });

  it("returns the branch row version with effective inherited rules", () => {
    const schema = read("supabase/schema.sql");
    expect(schema).toContain("FUNCTION public.pos_rules_snapshot");
    expect(schema).toContain("'rules', public.pos_rules_get(r.store_id)");
    expect(schema).toContain("'row_version', COALESCE(m.row_version, 1)");
  });

  it("keeps offline replay behind the same optimistic concurrency RPC", () => {
    const worker = read("electron/sync/worker.cjs");
    expect(worker).toContain('supabase.rpc("pos_rules_save"');
    expect(worker).toContain("_expected_version: expectedVersion");
    expect(worker).toContain('if (table === "pos_store_settings") await cloudSaveRules(rows)');
  });
});
