import { describe, expect, it, vi, beforeEach } from "vitest";

const restMock = vi.fn();
vi.mock("../pos-relay.server", () => ({ serviceRest: (...a: unknown[]) => restMock(...a) }));

import { safeAuthorizeRelayOp, type RelayScope } from "../relay-policy.server";

const cashier: RelayScope = {
  kind: "cashier",
  label: "till1",
  storeId: "STORE-A",
  role: "staff",
  roleSlug: "cashier",
  permissions: { can_process_sale: true },
  isSupervisor: false,
};

const admin: RelayScope = { ...cashier, role: "admin", roleSlug: "admin", isSupervisor: true };

beforeEach(() => restMock.mockReset());

describe("relay authorisation", () => {
  it("stamps the caller's branch onto inserted rows", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "insert", table: "sales", rows: [{ id: "1" }] },
      cashier,
    );
    expect(out.ok).toBe(true);
    if (out.ok && out.op.kind === "insert") expect(out.op.rows[0]!["store_id"]).toBe("STORE-A");
  });

  it("refuses a row that claims another branch", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "insert", table: "sales", rows: [{ id: "1", store_id: "STORE-B" }] },
      cashier,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("STORE_FORBIDDEN");
  });

  it("pins updates to the caller's branch", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "update", table: "shifts", values: { note: "x" }, match: { id: "s1" } },
      cashier,
    );
    expect(out.ok).toBe(true);
    if (out.ok && out.op.kind === "update") expect(out.op.match["store_id"]).toBe("STORE-A");
  });

  it("blocks a permission-gated column", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "update", table: "products", values: { selling_price: 1 }, match: { id: "p" } },
      cashier,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("PERMISSION_DENIED");
  });

  it("allows a supervisor across branches", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "update", table: "sales", values: { is_refunded: true }, match: { store_id: "STORE-B" } },
      admin,
    );
    expect(out.ok).toBe(true);
  });

  it("never writes tables outside the relay set", async () => {
    const out = await safeAuthorizeRelayOp(
      { kind: "insert", table: "stores", rows: [{ id: "x" }] },
      cashier,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("TABLE_FORBIDDEN");
  });

  it("refuses a child row whose parent belongs to another branch", async () => {
    restMock.mockResolvedValue({ ok: true, json: async () => [{ store_id: "STORE-B" }] });
    const out = await safeAuthorizeRelayOp(
      { kind: "insert", table: "sale_items", rows: [{ id: "i", sale_id: "s2" }] },
      cashier,
    );
    expect(out.ok).toBe(false);
  });
});
