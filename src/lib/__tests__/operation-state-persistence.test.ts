import { beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};

describe("background operation persistence", () => {
  beforeEach(() => {
    values.clear();
    vi.resetModules();
    Object.assign(globalThis, { window: { localStorage }, localStorage });
  });

  it("restores the last progress after navigation or reload", async () => {
    const first = await import("../sync-progress");
    first.beginSyncRun(["products", "members"]);
    first.markTableSync("products", "synced", "12 rows");

    vi.resetModules();
    const restored = await import("../sync-progress");
    expect(restored.syncProgress()).toMatchObject({
      status: "error",
      progress: 50,
      currentTable: "products",
      lastError:
        "The previous sync was interrupted. Its queued work is safe and will resume automatically.",
    });
  });

  it("restores completed state without pretending another run is needed", async () => {
    const first = await import("../sync-progress");
    first.beginSyncRun(["products"]);
    first.markTableSync("products", "synced", "4 rows");
    first.endSyncRun();

    vi.resetModules();
    const restored = await import("../sync-progress");
    expect(restored.syncProgress()).toMatchObject({ status: "done", progress: 100 });
  });
});
