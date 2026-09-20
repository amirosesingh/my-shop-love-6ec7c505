import { describe, expect, it, vi } from "vitest";

describe("SQL Server persistent state machine", () => {
  it("starts nothing while disabled and restores one pool when enabled", async () => {
    const { DatabaseService } = await import("../../../electron/db/service.cjs");
    let enabled = false;
    const secureConfig = {
      enabled: () => enabled,
      setEnabled: (value: boolean) => { enabled = value; },
      profile: () => ({ host: "db", port: 1433, database: "POS", authMode: "windows" }),
      credentials: () => ({ host: "db", port: 1433, database: "POS", authMode: "windows" }),
      remove: vi.fn(), save: vi.fn(),
    };
    const manager = { open: vi.fn(), close: vi.fn() };
    const service = new DatabaseService({ secureConfig, manager });
    await service.restore();
    expect(service.snapshot().state).toBe("disabled");
    expect(manager.open).not.toHaveBeenCalled();
    await service.setEnabled(true);
    expect(manager.open).toHaveBeenCalledOnce();
    expect(service.snapshot().state).toBe("enabled_bootstrapping");
    expect(service.snapshot().tradingReady).toBe(false);
    service.markReady();
    expect(service.snapshot().state).toBe("enabled_ready");
  });

  it("survives restart as enabled but requires setup without a saved profile", async () => {
    const { DatabaseService } = await import("../../../electron/db/service.cjs");
    const service = new DatabaseService({
      secureConfig: { enabled: () => true, profile: () => null, credentials: () => null },
      manager: { open: vi.fn(), close: vi.fn() },
    });
    expect((await service.restore()).state).toBe("enabled_unconfigured");
  });
});
