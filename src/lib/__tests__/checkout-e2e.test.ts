/**
 * Checkout, end to end at the database boundary.
 *
 * A completed bill must land as one consistent set of rows (bill, lines,
 * tenders, stock movements, member points), and a retried attempt must never
 * bill the customer twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.fn();
const localWrite = vi.fn();
const attemptRows = vi.fn(() => ({ data: [] as unknown[] | null, error: null as unknown }));

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/core/local-db/local-db", () => ({
  localDb: () => ({ write: (...a: unknown[]) => localWrite(...a) }),
  electronDb: () => null,
  readBranch: () => ({ branchId: null, branchName: null }),
}));
vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => attemptRows() }) }),
    }),
  },
}));

import { db } from "@/core/api/pos-db";
import { setPreferredDatabaseMode } from "@/core/local-db/db-mode";
import type { Sale } from "@/core/types/pos-types";

const sale = (over: Partial<Sale> = {}): Sale =>
  ({
    id: "sale-1",
    clientTxnId: "txn-1",
    receiptNo: "B101-PC01-20260811-0001",
    storeId: "store-1",
    shiftId: "shift-1",
    lines: [
      { productId: "p1", name: "Racket", price: 100, qty: 1, taxRate: 0, discount: 0, cost: 60 },
    ],
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    paid: 100,
    change: 0,
    method: "cash",
    memberId: null,
    pointsEarned: 0,
    cashier: "Cashier",
    createdAt: new Date().toISOString(),
    ...over,
  }) as Sale;

const opsSent = () => live.mock.calls.map((c) => c[1] as {
  kind: string;
  table: string;
  rows?: unknown[];
  args?: Record<string, unknown>;
});
const saleArgs = () => opsSent().find((o) => o.kind === "rpc" && o.table === "sales")?.args;

describe("checkout commit", () => {
  beforeEach(() => {
    live.mockReset();
    localWrite.mockReset();
    attemptRows.mockReturnValue({ data: [], error: null });
    live.mockResolvedValue(undefined);
    localWrite.mockResolvedValue({ ok: true });
    setPreferredDatabaseMode("online");
  });
  afterEach(() => setPreferredDatabaseMode("local"));

  it("writes bill, lines, tender ledger and stock movement together", async () => {
    await db.commitSale(sale(), [], null);
    expect(opsSent().map((o) => `${o.kind}:${o.table}`)).toContain("rpc:sales");
    expect(saleArgs()?.["_sale"]).toBeTruthy();
    expect(saleArgs()?.["_items"]).toHaveLength(1);
    expect(saleArgs()?.["_payments"]).toHaveLength(1);
    expect(saleArgs()?.["_movements"]).toHaveLength(1);
  });

  it("records one ledger row per tender on a split payment", async () => {
    await db.commitSale(
      sale({
        payments: [
          { method: "cash", amount: 60 },
          { method: "card", amount: 40 },
        ],
      } as never),
      [],
      null,
    );
    const tenders = saleArgs()?.["_payments"] as { amount: number }[];
    expect(tenders).toHaveLength(2);
    expect(tenders.reduce((a, r) => a + r.amount, 0)).toBe(100);
  });

  it("skips a zero-value tender line", async () => {
    await db.commitSale(
      sale({ payments: [{ method: "cash", amount: 100 }, { method: "card", amount: 0 }] } as never),
      [],
      null,
    );
    expect(saleArgs()?.["_payments"]).toHaveLength(1);
  });

  it("does not bill twice when the same attempt is retried", async () => {
    attemptRows.mockReturnValue({ data: [{ id: "sale-1" }], error: null });
    const target = await db.commitSale(sale(), [], null);
    expect(target).toBe("cloud");
    expect(opsSent()).toHaveLength(1);
    expect(opsSent()[0]?.kind).toBe("rpc");
  });

  it("still saves when the duplicate check itself cannot run", async () => {
    attemptRows.mockReturnValue({ data: null, error: { message: "offline" } });
    await db.commitSale(sale(), [], null);
    expect(saleArgs()?.["_sale"]).toBeTruthy();
  });

  it("links an exchange back to the original bill", async () => {
    await db.commitSale(sale({ exchangeOfReceiptNo: "B101-PC01-20260810-0007" } as never), [], null);
    expect(saleArgs()?.["_exchange_bill"]).toBe("B101-PC01-20260810-0007");
  });

  it("marks returned lines as returns in the stock ledger", async () => {
    await db.commitSale(
      sale({
        lines: [
          { productId: "p1", name: "Racket", price: 100, qty: 1, taxRate: 0, discount: 0 },
          { productId: "p2", name: "Grip", price: 40, qty: -1, taxRate: 0, discount: 0, credit: true },
        ],
      } as never),
      [],
      null,
    );
    const moves = saleArgs()?.["_movements"] as { activity_type: string; quantity_delta: number }[];
    expect(moves.map((m) => m.activity_type)).toEqual(["sale", "return"]);
    expect(moves[1].quantity_delta).toBe(1);
  });
});
