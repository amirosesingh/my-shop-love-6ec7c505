import { beforeEach, describe, expect, it, vi } from "vitest";

// The library only touches storage when a window exists; give it a small one.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
};

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
let responder: (call: Call) => { data: unknown; error: { message: string } | null };

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      const call = { fn, args };
      calls.push(call);
      return Promise.resolve(responder(call));
    },
  },
}));

const {
  applyStockDeltaBatch,
  listUnappliedStock,
  retryAllUnappliedStock,
  dueUnappliedStock,
} = await import("../stock-recovery");

type Movement = { movementId: string; productId: string; storeId: string | null; delta: number };

const basket = (n: number, store = "S1"): Movement[] =>
  Array.from({ length: n }, (_, i) => ({
    movementId: `m${i + 1}`,
    productId: `p${i + 1}`,
    storeId: store,
    delta: -1,
  }));

/** Central database that applies each movement id exactly once. */
function centralDatabase(options?: { fail?: Set<string>; branch?: string }) {
  const applied = new Map<string, number>();
  responder = ({ fn, args }) => {
    if (fn !== "stock_apply_deltas") return { data: null, error: { message: "unexpected rpc" } };
    const movements = args["_movements"] as Record<string, unknown>[];
    const seen = new Set<string>();
    const rows = movements.map((m) => {
      const id = String(m["movement_id"]);
      if (seen.has(id)) return { movement_id: id, status: "duplicate", reason: null };
      seen.add(id);
      if (options?.branch && m["store_id"] !== options.branch)
        return { movement_id: id, status: "refused", reason: "not_permitted" };
      if (options?.fail?.has(id))
        return { movement_id: id, status: "refused", reason: "failed" };
      if (applied.has(id)) return { movement_id: id, status: "duplicate", reason: null };
      applied.set(id, Number(m["delta"] ?? 0));
      return { movement_id: id, status: "applied", reason: null };
    });
    return { data: rows, error: null };
  };
  return applied;
}

describe("batch stock deltas", () => {
  beforeEach(() => {
    window.localStorage.clear();
    calls.length = 0;
  });

  it("applies a one-line sale in a single round trip", async () => {
    const applied = centralDatabase();
    const out = await applyStockDeltaBatch(basket(1));
    expect(out).toEqual([{ movementId: "m1", status: "applied", code: undefined, reason: null }]);
    expect(calls).toHaveLength(1);
    expect(applied.size).toBe(1);
    expect(listUnappliedStock()).toHaveLength(0);
  });

  it("applies a 30-line basket in one round trip", async () => {
    const applied = centralDatabase();
    const out = await applyStockDeltaBatch(basket(30));
    expect(out).toHaveLength(30);
    expect(calls).toHaveLength(1); // was 30 sequential calls before
    expect(applied.size).toBe(30);
  });

  it("collapses a duplicate movement id inside one batch", async () => {
    const applied = centralDatabase();
    const lines = basket(1);
    await applyStockDeltaBatch([...lines, ...lines]);
    const sent = (calls[0]?.args["_movements"] as unknown[]) ?? [];
    expect(sent).toHaveLength(1);
    expect(applied.get("m1")).toBe(-1);
  });

  it("never deducts twice when the same movement is replayed", async () => {
    const applied = centralDatabase();
    await applyStockDeltaBatch(basket(2));
    const again = await applyStockDeltaBatch(basket(2));
    expect(again.every((r) => r.status === "duplicate")).toBe(true);
    expect([...applied.values()]).toEqual([-1, -1]);
  });

  it("reports per-movement failure without losing the successes", async () => {
    const applied = centralDatabase({ fail: new Set(["m2"]) });
    const out = await applyStockDeltaBatch(basket(3));
    expect(out.map((r) => r.status)).toEqual(["applied", "refused", "applied"]);
    expect(applied.size).toBe(2);
    const parked = listUnappliedStock();
    expect(parked).toHaveLength(1);
    expect(parked[0]?.movementId).toBe("m2");
    expect(parked[0]?.retryable).toBe(true);
  });

  it("retries a failed movement once the fault clears, and only applies it once", async () => {
    centralDatabase({ fail: new Set(["m2"]) });
    await applyStockDeltaBatch(basket(3));
    const applied = centralDatabase(); // fault cleared
    const res = await retryAllUnappliedStock({ force: true });
    expect(res.applied).toBe(1);
    expect(res.remaining).toBe(0);
    expect(applied.get("m2")).toBe(-1);
  });

  it("queues everything while offline and flushes in one batch on reconnect", async () => {
    responder = () => ({ data: null, error: { message: "Failed to fetch" } });
    await applyStockDeltaBatch(basket(5));
    const parked = listUnappliedStock();
    expect(parked).toHaveLength(5);
    expect(parked.every((r) => r.retryable && r.code === "connection")).toBe(true);

    calls.length = 0;
    const applied = centralDatabase();
    await retryAllUnappliedStock({ force: true });
    expect(calls).toHaveLength(1);
    expect(applied.size).toBe(5);
    expect(listUnappliedStock()).toHaveLength(0);
  });

  it("backs off before a queued movement becomes due again", async () => {
    responder = () => ({ data: null, error: { message: "Failed to fetch" } });
    await applyStockDeltaBatch(basket(1));
    expect(dueUnappliedStock()).toHaveLength(0);
    expect(dueUnappliedStock(Date.now() + 60 * 60_000)).toHaveLength(1);
  });

  it("refuses a movement aimed at another branch and never retries it blindly", async () => {
    centralDatabase({ branch: "S1" });
    const out = await applyStockDeltaBatch(basket(1, "S2"));
    expect(out[0]?.status).toBe("refused");
    const parked = listUnappliedStock();
    expect(parked[0]?.retryable).toBe(false);

    calls.length = 0;
    const res = await retryAllUnappliedStock({ force: true });
    expect(calls).toHaveLength(0);
    expect(res.blocked).toBe(1);
  });

  it("handles two concurrent movements against the same product exactly once each", async () => {
    const applied = centralDatabase();
    const both: Movement[] = [
      { movementId: "a", productId: "p1", storeId: "S1", delta: -2 },
      { movementId: "b", productId: "p1", storeId: "S1", delta: -3 },
    ];
    const [first, second] = await Promise.all([
      applyStockDeltaBatch(both),
      applyStockDeltaBatch(both),
    ]);
    const statuses = [...(first ?? []), ...(second ?? [])].map((r) => r.status);
    expect(statuses.filter((s) => s === "applied")).toHaveLength(2);
    expect(applied.get("a")).toBe(-2);
    expect(applied.get("b")).toBe(-3);
  });

  it("falls back to per-movement calls when the batch routine is missing", async () => {
    const seen: string[] = [];
    responder = ({ fn, args }) => {
      if (fn === "stock_apply_deltas")
        return { data: null, error: { message: "Could not find the function in the schema cache" } };
      seen.push(String(args["_movement_id"]));
      return { data: 0, error: null };
    };
    const out = await applyStockDeltaBatch(basket(4));
    expect(out.every((r) => r.status === "applied")).toBe(true);
    expect(seen).toEqual(["m1", "m2", "m3", "m4"]);
  });
});
