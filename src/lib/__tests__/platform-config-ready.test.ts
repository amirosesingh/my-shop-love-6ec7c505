/**
 * A terminal is ready only when its own secure store holds a valid tenant.
 * Nothing may come from the web deployment's environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const platform = vi.hoisted(() => ({ terminal: true }));
const store = vi.hoisted(() => ({
  status: { configured: false, url: "", keyHint: "", encrypted: true, source: "android" as const },
}));

vi.mock("@/platform-config/platform", () => ({
  isTerminalApp: () => platform.terminal,
}));

vi.mock("@/lib/secure-cloud-config", () => ({
  cloudKeyStatus: async () => store.status,
  subscribeCloudKeys: () => () => {},
}));

vi.mock("@/lib/external-supabase-config", () => ({
  hasTerminalSupabaseOverride: () => store.status.configured,
}));

import { hasRequiredPlatformConfig } from "../platform-config-ready";

describe("hasRequiredPlatformConfig", () => {
  beforeEach(() => {
    platform.terminal = true;
    store.status = { configured: false, url: "", keyHint: "", encrypted: true, source: "android" };
  });

  it("reports a fresh terminal as missing, not as an error", async () => {
    const res = await hasRequiredPlatformConfig();
    expect(res.ready).toBe(false);
    expect(res.state).toBe("missing");
  });

  it("rejects a stored address that is not a real https URL", async () => {
    store.status = { configured: true, url: "not-a-url", keyHint: "x", encrypted: true, source: "android" };
    const res = await hasRequiredPlatformConfig();
    expect(res.ready).toBe(false);
    expect(res.state).toBe("invalid");
  });

  it("accepts a configured terminal", async () => {
    store.status = {
      configured: true,
      url: "https://tenant.example.co",
      keyHint: "abc…wxyz",
      encrypted: true,
      source: "android",
    };
    const res = await hasRequiredPlatformConfig();
    expect(res).toEqual({ ready: true, state: "ready" });
  });

  it("never blocks the web build", async () => {
    platform.terminal = false;
    const res = await hasRequiredPlatformConfig();
    expect(res).toEqual({ ready: true, state: "not-applicable" });
  });
});
