import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = { ok: true };

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    from: () => ({
      select: () => ({
        limit: async () => (cloud.ok ? { error: null } : { error: { message: "Failed to fetch" } }),
      }),
    }),
  },
}));

const bridge: { connected: boolean; present: boolean } = { connected: false, present: false };

vi.mock("@/lib/local-db", () => ({
  localDb: () => (bridge.present ? { status: async () => ({ connected: bridge.connected }) } : null),
}));

import { checkHealth, resetHealthCache } from "@/core/activation/connection-health";
import { connectivityWarningAllowed, isConnectivityMessage } from "@/lib/notification-guard";

describe("connection health", () => {
  beforeEach(() => {
    resetHealthCache();
    cloud.ok = true;
    bridge.present = false;
    bridge.connected = false;
  });

  it("reports the cloud as reachable on its own", async () => {
    const report = await checkHealth();
    expect(report.cloud).toBe(true);
    expect(report.anyOnline).toBe(true);
  });

  it("reports the local database as reachable when the cloud is down", async () => {
    cloud.ok = false;
    bridge.present = true;
    bridge.connected = true;
    const report = await checkHealth();
    expect(report.cloud).toBe(false);
    expect(report.local).toBe(true);
    expect(report.anyOnline).toBe(true);
  });

  it("reuses the cached answer inside the cache window", async () => {
    const first = await checkHealth();
    cloud.ok = false;
    const second = await checkHealth();
    expect(second.at).toBe(first.at);
    expect(second.cloud).toBe(true);
  });

  it("sees nothing reachable when both are down", async () => {
    cloud.ok = false;
    const report = await checkHealth();
    expect(report.anyOnline).toBe(false);
  });
});

describe("notification guard", () => {
  beforeEach(() => {
    resetHealthCache();
    cloud.ok = true;
    bridge.present = false;
    bridge.connected = false;
  });

  it("recognises connectivity wording", () => {
    expect(isConnectivityMessage("Database Connection Required: ...")).toBe(true);
    expect(isConnectivityMessage("Saving sale is missing a required field.")).toBe(false);
  });

  it("suppresses an offline warning while a database is reachable", async () => {
    expect(await connectivityWarningAllowed()).toBe(false);
  });

  it("allows the warning only when nothing answers", async () => {
    cloud.ok = false;
    expect(await connectivityWarningAllowed()).toBe(true);
  });
});