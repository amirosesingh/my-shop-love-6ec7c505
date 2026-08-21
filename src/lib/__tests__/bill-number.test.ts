import { describe, expect, it, beforeEach } from "vitest";
import { billPrefix, dayStamp, nextBillNumber } from "@/lib/bill-number";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => store.clear());

describe("bill numbers", () => {
  it("uses the configured branch, till and padding", () => {
    const n = nextBillNumber("B1", [], { branchCode: "B101", terminalNo: "3", padding: 5 });
    expect(n).toMatch(/^B101-[A-Z]{2}03-\d{8}-00001$/);
  });

  it("keeps counting up within the same day", () => {
    const cfg = { branchCode: "B1", terminalNo: "01" };
    const a = nextBillNumber("B1", [], cfg);
    const b = nextBillNumber("B1", [a], cfg);
    expect(Number(b.split("-").pop())).toBe(Number(a.split("-").pop()) + 1);
  });

  it("seeds from the highest existing number of the day", () => {
    const cfg = { branchCode: "B1", terminalNo: "01" };
    const prefix = billPrefix("B1", new Date(), cfg);
    const next = nextBillNumber("B1", [`${prefix}-0042`], cfg);
    expect(next).toBe(`${prefix}-0043`);
  });

  it("stamps the day in the configured time zone", () => {
    const at = new Date("2026-08-11T20:00:00Z");
    expect(dayStamp(at, "Pacific/Kiritimati")).toBe("20260812");
    expect(dayStamp(at, "America/New_York")).toBe("20260811");
  });
});

describe("bill number reservation failures", () => {
  it("refuses to hand out a number the device could not record", async () => {
    const original = globalThis.localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    const { nextBillNumber: next, reserveBillNumber, BillNumberReservationError } = await import(
      "@/lib/bill-number"
    );
    expect(() => next("B1", [], { branchCode: "B101" })).toThrow(BillNumberReservationError);
    await expect(reserveBillNumber("B1", [], { branchCode: "B101" })).rejects.toBeInstanceOf(
      BillNumberReservationError,
    );
    (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  it("awaits the durable reservation before returning a number", async () => {
    const { reserveBillNumber } = await import("@/lib/bill-number");
    const a = await reserveBillNumber("B1", [], { branchCode: "B101", padding: 4 });
    const b = await reserveBillNumber("B1", [], { branchCode: "B101", padding: 4 });
    expect(a).not.toEqual(b);
  });
});
