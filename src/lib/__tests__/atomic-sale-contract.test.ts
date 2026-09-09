import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("atomic central sale contract", () => {
  it("commits the financial graph and stock deltas inside one database function", () => {
    const migration = read("supabase/migrations/20260908090000_atomic_pos_sale_commit.sql");
    expect(migration).toContain("FUNCTION public.pos_sale_commit");
    expect(migration).toContain("INSERT INTO public.sales");
    expect(migration).toContain("INSERT INTO public.sale_items");
    expect(migration).toContain("INSERT INTO public.payment_transactions");
    expect(migration).toContain("INSERT INTO public.item_activity_logs");
    expect(migration).toContain("public.stock_apply_deltas");
    expect(migration).toContain("SECURITY INVOKER");
  });

  it("routes online clients and Electron replay through the same RPC", () => {
    const gateway = read("src/core/api/pos-db.ts");
    const worker = read("electron/sync/worker.cjs");
    expect(gateway).toContain('fn: "pos_sale_commit"');
    expect(worker).toContain('fn: "pos_sale_commit"');
    expect(gateway).toContain("_member: member ? memberToRow(member, tierId) : null");
  });

  it("allows the Electron atomic sale RPC through the HTTP relay contract", () => {
    const endpoint = read("src/lib/sync-endpoint.server.ts");
    const relay = read("src/core/api/pos-relay.server.ts");
    expect(endpoint).toContain('z.enum(["pos_sale_commit", "sale_refund"])');
    expect(relay).toContain('if (op.fn === "pos_sale_commit")');
    expect(relay).toContain("scope.permissions.can_process_sale");
  });
});
