/** Windows checkout is durable locally before background cloud synchronization. */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const live = vi.fn();
const localWriteBatch = vi.fn();
const localMirrorBatch = vi.fn();
const localPush = vi.fn();

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/core/local-db/local-db", () => ({
  localDb: () => ({
    write: vi.fn(),
    writeBatch: (...a: unknown[]) => localWriteBatch(...a),
    localMirrorBatch: (...a: unknown[]) => localMirrorBatch(...a),
    push: (...a: unknown[]) => localPush(...a),
  }),
  readBranch: () => ({ branchId: null, branchName: null }),
}));

import { commitOps, db } from "@/core/api/pos-db";
import { setPreferredDatabaseMode } from "@/core/local-db/db-mode";

const ops = [{ kind: "insert", table: "sales", rows: [{ id: "s1" }] }] as never;

describe("commitOps on a Windows till", () => {
  // The local engine only exists inside the Electron shell; `window.pos` is
  // how the app recognises it.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: Record<string, unknown> }).window ??= {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      navigator: { onLine: true },
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { window: Record<string, unknown> }).window["pos"] = {};
    live.mockReset();
    localWriteBatch.mockReset();
    localMirrorBatch.mockReset();
    localPush.mockReset();
    localWriteBatch.mockResolvedValue({ ok: true });
    localMirrorBatch.mockImplementation(async (entries: Array<{ rows?: unknown[] }>) => ({
      ok: true,
      written: entries.reduce((total, entry) => total + (entry.rows?.length ?? 0), 0),
    }));
    setPreferredDatabaseMode("online");
  });
  afterEach(() => {
    setPreferredDatabaseMode("local");
    delete (globalThis as unknown as { window: Record<string, unknown> }).window["pos"];
  });

  it("commits one local SQL batch before starting cloud synchronization", async () => {
    live.mockResolvedValue(undefined);
    await expect(commitOps("Saving sale", ops)).resolves.toBe("local");
    expect(localWriteBatch).toHaveBeenCalledWith("Saving sale", ops);
    expect(localPush).toHaveBeenCalledTimes(1);
    expect(live).not.toHaveBeenCalled();
  });

  it("does not contact the cloud inline when the line is down", async () => {
    live.mockRejectedValue(new Error("Failed to fetch"));
    await expect(commitOps("Saving sale", ops)).resolves.toBe("local");
    expect(localWriteBatch).toHaveBeenCalledTimes(1);
    expect(live).not.toHaveBeenCalled();
  });

  it("uses the shared atomic local batch instead of the legacy createSale shortcut", async () => {
    live.mockResolvedValue(undefined);
    const target = await db.commitSale(
      {
        id: "sale-1",
        receiptNo: "INV-1",
        storeId: "store-1",
        shiftId: "shift-1",
        lines: [],
        subtotal: 10,
        discount: 0,
        tax: 0,
        total: 10,
        paid: 10,
        change: 0,
        method: "cash",
        memberId: null,
        pointsEarned: 0,
        cashier: "Cashier",
        createdAt: new Date().toISOString(),
      },
      [],
      null,
    );
    expect(target).toBe("local");
    expect(localWriteBatch).toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });

  it("stops instead of creating a cloud-only gap when SQLite refuses the batch", async () => {
    localMirrorBatch.mockResolvedValue({ ok: false, written: 0, error: "no local engine" });
    await expect(commitOps("Saving sale", ops)).rejects.toThrow(/Local Database Required/);
    expect(localWriteBatch).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });

  it("does not use the browser outbox for an atomic desktop batch", async () => {
    const { listQueue } = await import("@/lib/sync-outbox");
    const before = listQueue().length;
    const basket = [
      { kind: "insert", table: "sales", rows: [{ id: "s9" }] },
      { kind: "insert", table: "sale_items", rows: [{ id: "l9", sale_id: "s9" }] },
      { kind: "insert", table: "payment_transactions", rows: [{ id: "t9" }] },
    ] as never;
    await expect(commitOps("Saving sale", basket)).resolves.toBe("local");
    expect(localWriteBatch).toHaveBeenCalledWith("Saving sale", basket);
    expect(listQueue().slice(before)).toEqual([]);
  });

  it("keeps stock quantity, adjustment audit, and count posting in one durable batch", async () => {
    const product = {
      id: "p1",
      name: "Grip",
      sku: "G1",
      barcode: "G1",
      category: "Accessories",
      price: 10,
      cost: 4,
      stockByStore: { store1: 8 },
      reorderLevel: 2,
      taxRate: 0,
    } as never;
    await db.commitStockAdjustments(
      [product],
      [
        {
          id: "adj1",
          productId: "p1",
          productName: "Grip",
          sku: "G1",
          storeId: "store1",
          reason: "count",
          previousStock: 5,
          updatedStock: 8,
          delta: 3,
        },
      ],
      { id: "count1", by: "Manager" },
    );
    const [, batch] = localWriteBatch.mock.calls.at(-1)!;
    expect(batch.map((op: { table: string }) => op.table)).toEqual([
      "products",
      "stock_adjustments",
      "stock_count_drafts",
    ]);
  });

  it.each([
    [
      "product",
      () =>
        db.commitProduct({
          id: "p1",
          name: "Grip",
          barcode: "G1",
          sku: "G1",
          category: "A",
          price: 1,
          cost: 1,
          stockByStore: {},
          reorderLevel: 0,
          taxRate: 0,
        } as never),
    ],
    [
      "member",
      () =>
        db.commitMember({
          id: "m1",
          code: "M1",
          name: "A",
          phone: "1",
          email: "",
          tier: "Bronze",
          points: 0,
          totalSpend: 0,
          joinedAt: "2026-01-01",
        } as never),
    ],
    ["refund", () => db.refundSale("s1", "refund:s1")],
    ["tender correction", () => db.updateSalePayment("s1", "card")],
    [
      "stock draft",
      () => db.saveStockCountDraft({ id: "c1", storeId: "store1", lines: [], totalImpact: 0 }),
    ],
    [
      "stock adjustment",
      () =>
        db.recordStockAdjustment({
          id: "a1",
          productId: "p1",
          productName: "Grip",
          sku: "G1",
          storeId: "store1",
          reason: "manual",
          previousStock: 1,
          updatedStock: 2,
          delta: 1,
        }),
    ],
  ])("does not acknowledge a %s when SQLite rejects it", async (_name, write) => {
    localMirrorBatch.mockResolvedValue({ ok: false, written: 0, error: "disk full" });
    await expect(write()).rejects.toThrow();
    expect(localWriteBatch).not.toHaveBeenCalled();
  });
});
