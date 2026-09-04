/**
 * Failure injection — shift closing.
 *
 * The drawer has been counted. Whatever happens to the line after that, the
 * count must survive and the server must still be the one that works out the
 * variance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: { rpc: (...a: unknown[]) => rpc(...a) },
}));

const store = new Map<string, string>();
(globalThis as unknown as { window: Record<string, unknown> }).window ??= {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  navigator: { onLine: false },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
// A desktop till: the only platform allowed to hold work on the device.
(globalThis as unknown as { window: Record<string, unknown> }).window["pos"] = {};

import { submitCashCount } from "@/lib/shift-closing";
import { listQueue } from "@/lib/sync-outbox";

const counted = { cash: 250.5, card: null, digital: null };

describe("failure injection — shift close", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("parks the blind count when the line dies mid-close", async () => {
    const before = listQueue().length;
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    const res = await submitCashCount("shift-1", counted, { clientKey: "shift-1:original" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.queued).toBe(true);
    const parked = listQueue().slice(before);
    expect(parked).toHaveLength(1);
    const op = parked[0]!.op as { fn: string; args: Record<string, unknown> };
    expect(op.fn).toBe("shift_cash_count_submit");
    // The same key travels with it, so a replay cannot count the drawer twice,
    // and no variance is computed on the till.
    expect(op.args["p_client_key"]).toBe("shift-1:original");
    expect(op.args["p_cash"]).toBe(250.5);
    expect(Object.keys(op.args)).not.toContain("p_variance");
  });

  it("does not park a count the server refused on principle", async () => {
    const before = listQueue().length;
    rpc.mockResolvedValue({ error: { message: "You do not have permission to submit a cash count." } });
    const res = await submitCashCount("shift-2", counted);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.queued).toBeFalsy();
    expect(listQueue().slice(before)).toHaveLength(0);
  });

  it("reports the state the server returned when the line is up", async () => {
    rpc.mockResolvedValue({ data: "CASH_COUNT_SUBMITTED", error: null });
    const res = await submitCashCount("shift-3", counted);
    expect(res).toEqual({ ok: true, state: "CASH_COUNT_SUBMITTED" });
  });
});
