import { paperCss, printableWidthMm } from "../pos-print";
import { afterEach, describe, expect, it, vi } from "vitest";
import { columnsForPaper } from "../escpos";
import { getPrinterPrefs, setSharedPrinterPrefs } from "../receipt-printer";

afterEach(() => { setSharedPrinterPrefs(undefined); vi.unstubAllGlobals(); });
describe("shared printer profiles", () => {
  it("supports the narrow 30mm roll without changing existing column counts", () => {
    expect(columnsForPaper("30mm")).toBe(16);
    expect(columnsForPaper("58mm")).toBe(32);
    expect(columnsForPaper("80mm")).toBe(42);
  });
  it("keeps 30mm content inside the printable band after margins", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    setSharedPrinterPrefs({ deviceName: "", share: "", margins: { top: 0, bottom: 0, left: 4, right: 4 },
      printWidth: { "30mm": 24, "58mm": 48, "80mm": 72 } });
    expect(paperCss("30mm").page).toBe("30mm auto");
    expect(printableWidthMm("30mm")).toBe(16);
    expect(printableWidthMm("80mm")).toBe(64);
  });
  it("uses the current scope and falls back to the device profile when cleared", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify({ deviceName: "Local" }) } });
    setSharedPrinterPrefs({ deviceName: "Branch 1", share: "", printWidth: { "30mm": 24, "58mm": 48, "80mm": 72 } });
    expect(getPrinterPrefs().deviceName).toBe("Branch 1");
    expect(getPrinterPrefs().printWidth?.["30mm"]).toBe(24);
    setSharedPrinterPrefs({ deviceName: "Branch 2", share: "" });
    expect(getPrinterPrefs().deviceName).toBe("Branch 2");
    setSharedPrinterPrefs(undefined);
    expect(getPrinterPrefs().deviceName).toBe("Local");
  });
});
