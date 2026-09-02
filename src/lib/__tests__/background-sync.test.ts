/**
 * Core behaviour of the background sync: how long a retry waits, how the
 * connection state settles, and what the shared indicator says.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal browser stand-in: these modules only need localStorage and timers.
beforeAll(() => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as Record<string, unknown>)["window"] = {
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  (globalThis as Record<string, unknown>)["localStorage"] = localStorage;
});
import { describeStatus } from "../system-status";
import { classifyFailure } from "../sync-log";
import { BACKOFF_FACTOR, BASE_BACKOFF_MS, resetSyncConfig, setSyncConfig, syncConfig } from "../sync-config";

describe("sync configuration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSyncConfig();
  });

  it("keeps every value inside safe limits", () => {
    setSyncConfig({ intervalMs: 1, batchSize: 99999, maxAttempts: 0, maxBackoffMs: 1 });
    const cfg = syncConfig();
    expect(cfg.intervalMs).toBeGreaterThanOrEqual(5000);
    expect(cfg.batchSize).toBeLessThanOrEqual(500);
    expect(cfg.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(cfg.maxBackoffMs).toBeGreaterThanOrEqual(30_000);
  });

  it("grows the retry wait 5s, 15s, 45s, 135s and then stops at the cap", () => {
    const cap = syncConfig().maxBackoffMs;
    const wait = (attempt: number) =>
      Math.min(cap, BASE_BACKOFF_MS * Math.pow(BACKOFF_FACTOR, attempt));
    expect([wait(0), wait(1), wait(2), wait(3)]).toEqual([5000, 15000, 45000, 135000]);
    expect(wait(20)).toBe(cap);
    expect(cap).toBe(300_000);
  });
});

describe("connection state", () => {
  beforeEach(async () => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("starts as connecting and never claims offline before the first check", async () => {
    const mod = await import("@/core/activation/connection-health");
    mod.resetConnectivity();
    expect(mod.connectivity()).toBe("connecting");
  });

  it("stays on connecting for at least the minimum so the screen cannot flash", async () => {
    const mod = await import("@/core/activation/connection-health");
    expect(mod.MIN_CONNECTING_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe("what the indicator says", () => {
  const base = {
    connectivity: "online" as const,
    pending: 0,
    conflicts: 0,
    syncing: false,
    syncEnabled: true,
    credentialsInvalid: false,
    lastError: null,
  };

  it("shows connecting before anything else", () => {
    expect(describeStatus({ ...base, connectivity: "connecting", pending: 4 }).tone).toBe(
      "connecting",
    );
  });

  it("counts the queue while offline", () => {
    const s = describeStatus({ ...base, connectivity: "offline", pending: 3 });
    expect(s.tone).toBe("offline");
    expect(s.label).toContain("3");
  });

  it("puts rejected credentials above every other message", () => {
    const s = describeStatus({ ...base, credentialsInvalid: true, pending: 2 });
    expect(s.tone).toBe("error");
    expect(s.label.toLowerCase()).toContain("credential");
  });

  it("says everything is synced when the queue is empty", () => {
    expect(describeStatus(base).tone).toBe("ok");
  });
});

describe("failure classification", () => {
  it("separates network, auth, conflict and data problems", () => {
    expect(classifyFailure("Failed to fetch")).toBe("network");
    expect(classifyFailure("401 Unauthorized")).toBe("auth");
    expect(classifyFailure("duplicate key value")).toBe("conflict");
    expect(classifyFailure("violates not-null constraint")).toBe("validation");
    expect(classifyFailure("something odd")).toBe("unknown");
  });
});

describe("settings changes reach the worker", () => {
  it("tells subscribers as soon as a value changes, so timers can be rebuilt", async () => {
    const mod = await import("../sync-config");
    mod.resetSyncConfig();
    const seen: number[] = [];
    const off = mod.subscribeSyncConfig(() => seen.push(mod.syncConfig().intervalMs));
    mod.setSyncConfig({ intervalMs: 60_000 });
    mod.setSyncConfig({ heartbeatMs: 30_000 });
    off();
    mod.setSyncConfig({ intervalMs: 45_000 });
    expect(seen).toEqual([60_000, 60_000]);
    expect(mod.syncConfig().heartbeatMs).toBe(30_000);
    mod.resetSyncConfig();
  });
});
