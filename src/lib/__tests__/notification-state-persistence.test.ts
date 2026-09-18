import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: { rpc },
}));
vi.mock("../activity-events.functions", () => ({ pushActivityEvent: vi.fn() }));

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};

describe("per-user notification state", () => {
  beforeEach(() => {
    values.clear();
    rpc.mockClear();
    Object.assign(globalThis, {
      window: { localStorage, dispatchEvent: vi.fn() },
      localStorage,
      CustomEvent: class {
        constructor(public type: string) {}
      },
    });
  });

  it("survives refresh and remains isolated between users", async () => {
    const activity = await import("../activity-events");
    activity.clearActivityEntry("manager-1", "event-1");
    expect(activity.isCleared("manager-1", "event-1")).toBe(true);
    expect(activity.isCleared("manager-2", "event-1")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("set_activity_event_cleared", {
      p_event_id: "event-1",
      p_cleared: true,
    });
  });

  it("merges a dismissal made on another device", async () => {
    const activity = await import("../activity-events");
    const row = {
      id: "event-remote",
      clearedBy: ["MANAGER-1"],
    } as Parameters<typeof activity.mergeRemoteActivityPreferences>[1][number];
    activity.mergeRemoteActivityPreferences("manager-1", [row]);
    expect(activity.clearedIds("manager-1")).toContain("event-remote");
  });

  it("persists read markers across navigation and login cycles", async () => {
    const activity = await import("../activity-events");
    activity.markActivitySeen("2026-09-15T12:00:00.000Z", "manager-1");
    expect(activity.lastSeenAt("manager-1")).toBe("2026-09-15T12:00:00.000Z");
    expect(activity.lastSeenAt("manager-2")).toBe("");
  });
});
