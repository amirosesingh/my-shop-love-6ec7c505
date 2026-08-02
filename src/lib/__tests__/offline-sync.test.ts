import { describe, expect, it, beforeEach } from "vitest";

// Minimal browser surface: these modules only need localStorage + crypto.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
} as never;
const window = (globalThis as unknown as { window: { localStorage: Storage } }).window;
import { replayOrder, nextSeq, terminalId, setBranchId, branchId } from "../activity-journal";
import { cacheCredential, verifyCachedPin, isExpired, listCachedCredentials } from "../offline-credentials";

describe("activity journal ordering", () => {
  beforeEach(() => window.localStorage.clear());

  it("hands out monotonic sequence numbers", () => {
    const a = nextSeq();
    const b = nextSeq();
    expect(b).toBe(a + 1);
    expect(terminalId()).toMatch(/^T-/);
  });

  it("remembers the active branch", () => {
    setBranchId("branch-2");
    expect(branchId()).toBe("branch-2");
  });

  it("replays oldest-first per terminal", () => {
    const rows = [
      { terminalId: "A", seq: 2, deviceTime: "2026-01-01T10:00:05Z" },
      { terminalId: "A", seq: 1, deviceTime: "2026-01-01T10:00:00Z" },
      { terminalId: "B", seq: 1, deviceTime: "2026-01-01T09:00:00Z" },
    ];
    const out = replayOrder(rows);
    const a = out.filter((r) => r.terminalId === "A");
    expect(a.map((r) => r.seq)).toEqual([1, 2]);
    expect(out[0]?.terminalId).toBe("B");
  });
});

describe("offline credentials", () => {
  beforeEach(() => window.localStorage.clear());

  it("verifies a cached PIN and rejects a wrong one", async () => {
    await cacheCredential("123456", {
      username: "amy",
      cashierId: "c1",
      fullName: "Amy",
      storeId: "s1",
      permissions: { can_view_inventory: true },
    });
    expect(await verifyCachedPin("amy", "123456")).not.toBeNull();
    expect(await verifyCachedPin("amy", "654321")).toBeNull();
    expect(await verifyCachedPin("nobody", "123456")).toBeNull();
  });

  it("never stores the PIN itself", async () => {
    await cacheCredential("123456", {
      username: "amy",
      cashierId: "c1",
      fullName: "Amy",
      storeId: "s1",
      permissions: {},
    });
    expect(JSON.stringify(listCachedCredentials())).not.toContain("123456");
  });

  it("expires stale cached logins", () => {
    const old = { cachedAt: new Date(Date.now() - 40 * 864e5).toISOString() } as never;
    expect(isExpired(old, 30)).toBe(true);
  });
});
