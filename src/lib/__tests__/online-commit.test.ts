/**
 * Online working must never make a sale wait on the local database.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const live = vi.fn();
const localWrite = vi.fn();
const legacyCreateSale = vi.fn();

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/core/local-db/local-db", () => ({
  localDb: () => ({ write: (...a: unknown[]) => localWrite(...a) }),
  electronDb: () => ({ createSale: (...a: unknown[]) => legacyCreateSale(...a) }),
  readBranch: () => ({ branchId: null, branchName: null }),
}));

import { commitOps, db } from "@/lib/pos-db";
import { setPreferredDatabaseMode } from "@/core/local-db/db-mode";

const ops = [{ kind: "insert", table: "sales", rows: [{ id: "s1" }] }] as never;

describe("commitOps in online mode with a local database present", () => {
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
    localWrite.mockReset();
    legacyCreateSale.mockReset();
    setPreferredDatabaseMode("online");
  });
  afterEach(() => {
    setPreferredDatabaseMode("local");
    delete (globalThis as unknown as { window: Record<string, unknown> }).window["pos"];
  });

  it("finishes the sale on the cloud even when the local copy fails", async () => {
    live.mockResolvedValue(undefined);
    localWrite.mockRejectedValue(new Error("local SQL unavailable"));
    await expect(commitOps("Saving sale", ops)).resolves.toBe("cloud");
    expect(live).toHaveBeenCalled();
  });

  it("falls back to the terminal when the line is down", async () => {
    live.mockRejectedValue(new Error("Failed to fetch"));
    localWrite.mockResolvedValue({ ok: true });
    await expect(commitOps("Saving sale", ops)).resolves.toBe("local");
  });

  it("does not take the old Electron local-only shortcut for a completed sale", async () => {
    live.mockResolvedValue(undefined);
    localWrite.mockResolvedValue({ ok: true });
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
    // Completed desktop sales use the shared cloud-first commit path rather
    // than the removed createSale-only branch.
    expect(target).toBe("cloud");
    expect(localWrite).toHaveBeenCalled();
    expect(legacyCreateSale).not.toHaveBeenCalled();
  });

  it("stops the action when neither database will take it", async () => {
    live.mockRejectedValue(new Error("Failed to fetch"));
    localWrite.mockResolvedValue({ ok: false, error: "no local engine" });
    await expect(commitOps("Saving sale", ops)).rejects.toThrow(/Database Connection Required|Central server relay is offline/);
  });
});
