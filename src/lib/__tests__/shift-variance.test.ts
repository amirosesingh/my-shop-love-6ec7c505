/**
 * Closing a shift on whatever cash was counted.
 *
 * The counted amount is final: the drawer never has to match. The shift closes
 * every time, the exact figure the cashier typed is what is kept, and any
 * difference at all — a single cent — is reported to the admins once.
 */
import { describe, expect, it } from "vitest";
import { varianceEventId, varianceOutcome } from "../shift-close";

describe("counting the drawer at close", () => {
  const cases: { counted: number; variance: number; status: string; notifies: boolean }[] = [
    { counted: 500, variance: 0, status: "NO_VARIANCE", notifies: false },
    { counted: 499.5, variance: -0.5, status: "SHORT", notifies: true },
    { counted: 499, variance: -1, status: "SHORT", notifies: true },
    { counted: 450, variance: -50, status: "SHORT", notifies: true },
    { counted: 100, variance: -400, status: "SHORT", notifies: true },
    { counted: 499.99, variance: -0.01, status: "SHORT", notifies: true },
    { counted: 500.5, variance: 0.5, status: "OVER", notifies: true },
    { counted: 700, variance: 200, status: "OVER", notifies: true },
    { counted: 1000, variance: 500, status: "OVER", notifies: true },
  ];

  for (const c of cases) {
    it(`expected 500, counted ${c.counted} closes with ${c.variance}`, () => {
      const out = varianceOutcome(500, c.counted);
      expect(out.closes).toBe(true);
      expect(out.variance).toBe(c.variance);
      expect(out.status).toBe(c.status);
      expect(out.notifies).toBe(c.notifies);
    });
  }

  it("keeps money to the cent instead of drifting", () => {
    expect(varianceOutcome(0.3, 0.1 + 0.2).variance).toBe(0);
    expect(varianceOutcome(500.1, 499.7).variance).toBe(-0.4);
  });

  it("never applies a minimum before reporting", () => {
    expect(varianceOutcome(500, 500.01).notifies).toBe(true);
    expect(varianceOutcome(500, 499.99).notifies).toBe(true);
  });

  it("raises no alert for a balanced drawer", () => {
    expect(varianceOutcome(500, 500).notifies).toBe(false);
  });

  it("gives one shift one notification identity, so retries cannot duplicate it", () => {
    const id = varianceEventId("11111111-2222-3333-4444-555555555555");
    expect(id).toBe("shift:11111111-2222-3333-4444-555555555555:cash_variance");
    expect(varianceEventId("11111111-2222-3333-4444-555555555555")).toBe(id);
    expect(varianceEventId("other")).not.toBe(id);
  });
});
