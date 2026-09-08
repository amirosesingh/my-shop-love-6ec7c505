/**
 * Failure injection — checkout and payment.
 *
 * Each case breaks the commit at the worst possible moment and asserts the till
 * ends somewhere an operator can recover from: no lost bill, no second charge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.fn();
const localWriteBatch = vi.fn();
const localMirrorBatch = vi.fn();

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/core/local-db/local-db", () => ({
  localDb: () => ({
    write: vi.fn(),
    writeBatch: (...a: unknown[]) => localWriteBatch(...a),
    localMirrorBatch: (...a: unknown[]) => localMirrorBatch(...a),
  }),
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
    localWriteBatch.mockReset();
    localMirrorBatch.mockReset();
    localMirrorBatch.mockResolvedValue({ ok: true, written: 3 });
    localWriteBatch.mockResolvedValue({ ok: true });
    setPreferredDatabaseMode("online");
  });
  afterEach(() => {
    setPreferredDatabaseMode("local");
    delete (globalThis as unknown as { window: Record<string, unknown> }).window["pos"];
  });

  it("accepts the durable SQLite batch when the compatibility projection is refused", async () => {
    const before = listQueue().length;
    localWriteBatch.mockResolvedValue({ ok: false, error: "null value in column" });
    await expect(commitOps("Saving sale", basket())).resolves.toBe("local");
    expect(queuedTables(before)).toEqual([]);
    expect(live).not.toHaveBeenCalled();
  });

  it("does not invite a duplicate retry when the compatibility projection fails", async () => {
    const before = listQueue().length;
    localWriteBatch.mockResolvedValue({ ok: false, error: "payment row refused" });
    await expect(commitOps("Saving sale", basket())).resolves.toBe("local");
    expect(queuedTables(before)).toEqual([]);
    expect(localMirrorBatch).toHaveBeenCalledTimes(1);
  });

  it("rejects the commit when the authoritative SQLite transaction fails", async () => {
    localMirrorBatch.mockResolvedValue({ ok: false, written: 0, error: "disk full" });
    await expect(commitOps("Saving sale", basket())).rejects.toThrow("Saving sale");
    expect(localWriteBatch).not.toHaveBeenCalled();
  });

  it("does not park anything in browser storage because the till writes locally", async () => {
    const before = listQueue().length;
    live.mockRejectedValue(new Error("Failed to fetch"));
    await expect(commitOps("Saving sale", basket())).resolves.toBe("local");
    expect(queuedTables(before)).toEqual([]);
    expect(localWriteBatch).toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });

  it("sends a repeated tender through the same idempotent local upsert", async () => {
    const tender = [
      { kind: "upsert", table: "payment_transactions", rows: [{ id: "t-9" }], onConflict: "id" },
    ] as never;
    await commitOps("Saving payment", tender);
    await commitOps("Saving payment", tender);
    expect(localWriteBatch).toHaveBeenCalledTimes(2);
    expect(localWriteBatch.mock.calls.every((call) => call[1] === tender)).toBe(true);
    expect(live).not.toHaveBeenCalled();
  });
});
