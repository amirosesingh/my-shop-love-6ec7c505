import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schemaPath = resolve(root, "supabase/schema.sql");

describe("canonical Supabase schema", () => {
  it("is the only hand-run central SQL installer", () => {
    const sqlDir = resolve(root, "supabase/sql");
    expect(readdirSync(sqlDir).sort()).toEqual(["README.md"]);
    expect(existsSync(schemaPath)).toBe(true);
  });

  it("repairs legacy transfer quantity types before transfer backfills", () => {
    const sql = readFileSync(schemaPath, "utf8");
    const repair = sql.indexOf("DO $quantity_types$");
    const backfill = sql.indexOf("SET quantity_verified = COALESCE");

    expect(repair).toBeGreaterThan(0);
    expect(backfill).toBeGreaterThan(repair);
    for (const column of [
      "quantity",
      "quantity_received",
      "quantity_approved",
      "quantity_dispatched",
      "quantity_verified",
    ]) {
      expect(sql).toContain(`'${column}'`);
    }
  });

  it("includes the deep inventory helper and final verification", () => {
    const sql = readFileSync(schemaPath, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.schema_inventory_deep()");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.schema_inventory_deep() FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("Schema check: everything present.");
  });
});