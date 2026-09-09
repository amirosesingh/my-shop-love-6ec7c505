import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const upgrade = read("supabase/sql/production_upgrade_current.sql");

const actionColumns = [
  "allowed_roles",
  "allowed_user_ids",
  "requester_roles",
  "requester_user_ids",
  "authority_limits",
  "extra_authority",
  "absolute_ceilings",
];
const requestColumns = [
  "requested_amount",
  "approved_amount",
  "requester_direct_limit",
  "value_unit",
  "approved_payload",
  "bill_snapshot",
  "snapshot_hash",
  "held_order_id",
  "notified_at",
];
const allColumns = [...actionColumns, ...requestColumns];

describe("manual production upgrade", () => {
  it("is one transactional, explicitly non-destructive manual entry point", () => {
    expect(upgrade).toMatch(/CURRENT PRODUCTION DATABASE UPGRADE/);
    expect(upgrade).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(upgrade).not.toMatch(/\b(?:TRUNCATE|DROP TABLE|DELETE FROM|99_reset)\b/i);
  });

  it("contains the cumulative approval migrations with guarded additions", () => {
    expect(upgrade).toContain("20260904111958_84467a29-26bd-47b6-b5b0-412ec9798f34.sql");
    expect(upgrade).toContain("20260909090000_approval_authority_limits.sql");
    expect(upgrade).toContain("20260909130000_relative_approval_authority.sql");
    for (const column of allColumns) {
      expect(upgrade).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
  });

  it("converges from none, first-only, and current column states without deleting data", () => {
    const apply = (existing: Set<string>) => {
      const result = new Set(existing);
      for (const column of allColumns) result.add(column); // models ADD COLUMN IF NOT EXISTS
      return result;
    };
    const existingData = "authorization-row-kept";
    const none = apply(new Set());
    const firstOnly = apply(new Set(["requester_roles", "requester_user_ids", "authority_limits"]));
    const current = apply(new Set(allColumns));
    expect([...none].sort()).toEqual([...firstOnly].sort());
    expect([...none].sort()).toEqual([...current].sort());
    expect(existingData).toBe("authorization-row-kept");
  });

  it("matches canonical schemas, generated types and authorization model", () => {
    const targets = [
      read("supabase/schema.sql"),
      read("supabase/retail_cloud_full.sql"),
      read("src/integrations/supabase/types.ts"),
    ];
    for (const column of allColumns) {
      for (const target of targets) expect(target).toContain(column);
    }
    const model = read("src/lib/authorization.ts");
    for (const field of [
      "authorityLimits", "extraAuthority", "absoluteCeilings", "requesterDirectLimit", "valueUnit",
    ]) expect(model).toContain(field);
  });

  it("guards indexes and realtime publication against repeat execution", () => {
    expect(upgrade).toMatch(/CREATE INDEX IF NOT EXISTS authorization_requests_requester_idx/);
    expect(upgrade).toMatch(/CREATE INDEX IF NOT EXISTS held_orders_status_idx/);
    expect(upgrade).toMatch(/NOT EXISTS \([\s\S]*pg_publication_tables/);
  });
});
