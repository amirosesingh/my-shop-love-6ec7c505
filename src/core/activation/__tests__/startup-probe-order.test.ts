/**
 * The launch order a till and a phone must follow:
 * saved connection restored → connection proven → registration → sign-in.
 *
 * These tests pin the two ordering rules that used to break it: the connection
 * check must wait for the device's saved connection, and a single slow answer
 * must not be recorded as "cannot be reached".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hydrateProfile = vi.fn(async () => {
  order.push("profile");
});
const order: string[] = [];
let queryImpl: () => Promise<{ error: { message: string } | null }>;

vi.mock("@/lib/connection-profile", () => ({
  awaitProfileHydrated: () => hydrateProfile(),
  hydrateConnectionProfile: () => hydrateProfile(),
}));

vi.mock("@/core/activation/terminal-tokens", () => ({
  hydrateTerminalConfig: async () => {
    order.push("terminal");
  },
}));

vi.mock("@/lib/external-supabase-config", () => ({
  hasSupabaseConfig: () => true,
}));

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    from: () => ({
      select: () => ({
        limit: () => {
          order.push("query");
          return queryImpl();
        },
      }),
    }),
  },
}));

describe("start-up connection check", () => {
  beforeEach(() => {
    vi.resetModules();
    order.length = 0;
    hydrateProfile.mockClear();
    queryImpl = async () => ({ error: null });
  });

  it("waits for the device's saved connection before probing", async () => {
    const health = await import("@/core/activation/connection-health");
    health.resetHealthCache();
    await health.checkHealth(true);
    expect(order.indexOf("profile")).toBeLessThan(order.indexOf("query"));
    expect(health.cloudVerdict()).toBe("verified");
  });

  it("retries once before calling a slow connection unreachable", async () => {
    let calls = 0;
    queryImpl = async () => {
      calls += 1;
      return calls === 1 ? { error: { message: "network error" } } : { error: null };
    };
    const health = await import("@/core/activation/connection-health");
    health.resetHealthCache();
    const report = await health.checkHealth(true);
    expect(calls).toBe(2);
    expect(report.cloud).toBe(true);
    expect(health.cloudVerdict()).toBe("verified");
  });

  it("reports a refused key as a configuration fault, not as offline", async () => {
    queryImpl = async () => ({ error: { message: "Invalid API key" } });
    const health = await import("@/core/activation/connection-health");
    health.resetHealthCache();
    await health.checkHealth(true);
    expect(health.cloudVerdict()).toBe("rejected");
  });

  it("only reports the first probe as done once it has settled", async () => {
    const health = await import("@/core/activation/connection-health");
    health.resetHealthCache();
    expect(health.hasProbedCloud()).toBe(false);
    await health.checkHealth(true);
    expect(health.hasProbedCloud()).toBe(true);
  });
});
