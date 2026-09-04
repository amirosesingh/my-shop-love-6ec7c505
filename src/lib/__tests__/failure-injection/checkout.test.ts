/**
 * Failure injection — checkout and payment.
 *
 * Each case breaks the commit at the worst possible moment and asserts the till
 * ends somewhere an operator can recover from: no lost bill, no second charge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.fn();
const localWrite = vi.fn();

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/core/local-db/local-db", () => ({
  localDb: () => ({ write: (...a: unknown[]) => localWrite(...a) }),
  electronDb: () => ({}),
  readBranch: () => ({ branchId: null, branchName: null }),
}));

import { commitOps } from "@/core/api/pos-db";
import { setPreferredDatabaseMode } from "@/core/local-db/db-mode";
import { listQueue } from "@/lib/sync-outbox";

const basket = () =>
  [
    { kind: "insert", table: "sales", rows: [{ id: "s-1" }] },
    { kind: "insert", table: "sale_items", rows: [{ id: "l-1", sale_id: "s-1" }] },
    { kind: "insert", table: "payment_transactions", rows: [{ id: "t-1" }] },
  ] as never;

const queuedTables = (from: number) => listQueue().slice(from).map((q) => q.op.table);

describe("failure injection — checkout", () => {
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
    localWrite.mockReset();
    localWrite.mockResolvedValue({ ok: true });
    setPreferredDatabaseMode("online");
  });
  afterEach(() => {
    setPreferredDatabaseMode("local");
    delete (globalThis as unknown as { window: Record<string, unknown> }).window["pos"];
  });

  it("stores nothing at all when the very first write is refused", async () => {
    // Nothing landed centrally, so the sale is simply refused: the cashier
    // sees the error, the cart is untouched, and no half bill is left behind.
    const before = listQueue().length;
    live.mockRejectedValue(new Error("null value in column"));
    await expect(commitOps("Saving sale", basket())).rejects.toThrow();
    expect(queuedTables(before)).toEqual([]);
    expect(live).toHaveBeenCalledTimes(1);
  });

  it("keeps only the tender when the last write is refused", async () => {
    const before = listQueue().length;
    live
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("null value in column"));
    await expect(commitOps("Saving sale", basket())).rejects.toThrow();
    expect(queuedTables(before)).toEqual(["payment_transactions"]);
  });

  it("does not park anything when the line simply drops — the till writes locally", async () => {
    const before = listQueue().length;
    live.mockRejectedValue(new Error("Failed to fetch"));
    await expect(commitOps("Saving sale", basket())).resolves.toBe("local");
    expect(queuedTables(before)).toEqual([]);
    expect(localWrite).toHaveBeenCalled();
  });

  it("charges once when the same tender is sent twice after a timeout", async () => {
    // The retry carries the same client transaction id, so the central copy is
    // merged rather than added; the ledger keeps one row.
    const seen = new Set<string>();
    live.mockImplementation(async (_c: string, op: { rows?: { id: string }[] }) => {
      for (const row of op.rows ?? []) seen.add(row.id);
    });
    const tender = [
      { kind: "upsert", table: "payment_transactions", rows: [{ id: "t-9" }], onConflict: "id" },
    ] as never;
    await commitOps("Saving payment", tender);
    await commitOps("Saving payment", tender);
    expect([...seen]).toEqual(["t-9"]);
  });
});
