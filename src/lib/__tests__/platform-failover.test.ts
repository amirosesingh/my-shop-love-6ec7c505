import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isOperationalTable, isOperationalBatch } from "@/lib/pos-auth-route";

describe("operational data classification", () => {
  it("treats money and stock movements as operational", () => {
    for (const t of ["sales", "sale_items", "shifts", "drawer_events", "stock_adjustments"])
      expect(isOperationalTable(t)).toBe(true);
  });

  it("leaves catalogue and settings on the existing durable path", () => {
    expect(isOperationalTable("products")).toBe(false);
    expect(isOperationalTable("pos_settings")).toBe(false);
    expect(isOperationalBatch([])).toBe(false);
  });
});

describe("platform wording for a total failure", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("names both databases on the Windows till", async () => {
    vi.doMock("@/platforms/mobile/native", () => ({ isNative: () => false, isElectron: () => true }));
    const { unreachableMessage } = await import("@/lib/db-mode");
    expect(unreachableMessage()).toMatch(/local database server or online database/);
  });

  it("names the server relay on the phone and in a browser", async () => {
    vi.doMock("@/platforms/mobile/native", () => ({ isNative: () => true, isElectron: () => false }));
    const { unreachableMessage } = await import("@/lib/db-mode");
    expect(unreachableMessage()).toMatch(/Central server relay is offline/);
  });
});
