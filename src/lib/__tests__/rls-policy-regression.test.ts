/**
 * Guards the access rules that Part 4 tightened.
 *
 * Each of these rule names was a wide-open duplicate (`USING true`) that
 * cancelled the stricter staff/branch rule beside it. The last word about
 * each name in the migration history must be a removal, never a re-creation.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const history = files.map((f) => ({ f, sql: readFileSync(join(DIR, f), "utf8") }));

const REMOVED = [
  "audit_logs_staff_read",
  "audit_logs_staff_insert",
  "branch_telemetry_staff_read",
  "branch_telemetry_staff_write",
  "branch_telemetry_staff_update",
  "payment_types_staff_read",
  "payment_types_staff_write",
];

describe("row-rule regression", () => {
  it.each(REMOVED)("%s stays removed", (name) => {
    const last = [...history].reverse().find((h) => h.sql.includes(name));
    expect(last, `${name} not found in any migration`).toBeTruthy();
    const line = last!.sql
      .split("\n")
      .filter((l) => l.includes(name))
      .pop()!;
    expect(line.toUpperCase()).toContain("DROP POLICY");
  });

  it("telemetry is branch-scoped on read, insert and update", () => {
    const sql = history.map((h) => h.sql).join("\n");
    const tail = sql.slice(sql.lastIndexOf("Telemetry visible in own branch"));
    expect(tail).toContain("user_has_store_access(store_id)");
    expect(sql).toContain("Telemetry reported for own branch");
    expect(sql).toContain("Telemetry refreshed for own branch");
  });

  it("PIN tables are unreachable from the data API", () => {
    const sql = history.map((h) => h.sql).join("\n");
    expect(sql).toContain("REVOKE ALL ON public.pin_attempts FROM anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON public.cashiers FROM anon, authenticated");
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.(pin_attempts|cashiers) TO (anon|authenticated)/);
  });
});
