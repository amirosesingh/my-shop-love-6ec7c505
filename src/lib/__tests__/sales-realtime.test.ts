import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("sales realtime refresh", () => {
  it("uses the shared channel as a notification and refetches canonical sales", () => {
    const engine = readFileSync("src/lib/sync-engine.ts", "utf8");
    const store = readFileSync("src/lib/pos-store.tsx", "utf8");
    expect(engine).toMatch(/LIVE_TABLES[\s\S]*"sales"/);
    expect(engine).toContain("announceSalesChange(changedTable, changedStore)");
    expect(engine).toContain("pendingLiveChanges");
    expect(engine).toContain("for (const [changedTable, changedStores] of changes)");
    expect(store).toContain("subscribeSalesChange");
    expect(store).toContain("subscribeSettingsChange");
    expect(store).toContain('change.table !== "pos_settings"');
    expect(store).toContain("loadCloudState()");
  });
});
