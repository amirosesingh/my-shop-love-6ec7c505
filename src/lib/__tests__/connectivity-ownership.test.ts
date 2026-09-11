import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("connectivity lifecycle ownership", () => {
  const root = read("src/routes/__root.tsx");
  const loader = read("src/components/shared/TillLoader.tsx");
  const gate = read("src/platforms/mobile/components/OfflineGate.tsx");
  const sync = read("src/lib/sync-engine.ts");

  it("has one app-level owner and no screen-level owners", () => {
    expect(root).toContain("startConnectivityMonitor");
    expect(root).toContain("subscribeSyncConfig");

    expect(loader).not.toContain("startConnectivityMonitor");
    expect(gate).not.toContain("startConnectivityMonitor");
    expect(sync).not.toContain("startConnectivityMonitor");
  });

  it("keeps consumers subscribed without owning the heartbeat", () => {
    expect(loader).toContain("subscribeConnectivity");
    expect(gate).toContain("subscribeConnectivity");
    expect(sync).toContain("subscribeConnectivity");
  });

  it("keeps manual retry and reconnect wake behaviour", () => {
    expect(gate).toContain("heartbeat()");
    expect(sync).toContain('runExclusive("network")');
    expect(sync).toContain('announceSettingsChange("reconnect")');
  });
});
