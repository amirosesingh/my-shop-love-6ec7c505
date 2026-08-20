import { describe, expect, it } from "vitest";
import { newAttemptId, withClientDeadline, STEP_DEADLINE_MS } from "@/lib/connection-attempt";

describe("connection attempt identity", () => {
  it("issues a unique id per run", () => {
    expect(newAttemptId()).not.toBe(newAttemptId());
  });

  it("resolves with the value when the call answers", async () => {
    const res = await withClientDeadline(Promise.resolve({ ok: true }), 500);
    expect(res.timedOut).toBe(false);
    if (!res.timedOut) expect(res.value).toEqual({ ok: true });
  });

  it("terminates a call that never settles", async () => {
    const res = await withClientDeadline(new Promise(() => {}), 20);
    expect(res.timedOut).toBe(true);
  });

  it("treats a rejection as a terminal state, never an unhandled rejection", async () => {
    const res = await withClientDeadline(Promise.reject(new Error("boom")), 200);
    expect(res.timedOut).toBe(true);
  });

  it("ignores a late result once the deadline passed", async () => {
    let settle: (v: string) => void = () => {};
    const work = new Promise<string>((r) => (settle = r));
    const res = await withClientDeadline(work, 10);
    expect(res.timedOut).toBe(true);
    settle("late"); // must not throw or change anything
  });

  it("bounds every wizard step", () => {
    for (const key of ["socket", "handshake", "catalog", "lock", "write"]) {
      expect(STEP_DEADLINE_MS[key]).toBeGreaterThan(0);
    }
  });
});
