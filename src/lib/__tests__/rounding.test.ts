/**
 * Total rounding: the number the customer actually pays, and when the
 * courtesy line is allowed on the slip.
 */
import { describe, expect, it } from "vitest";

import { applyRounding, roundTotal, roundingOf, showsRoundingLine } from "@/core/pricing/rounding";
import type { RoundingSettings } from "@/core/types/pos-types";

const cfg = (over: Partial<RoundingSettings> = {}): RoundingSettings =>
  roundingOf({ enabled: true, unit: 0.05, direction: "nearest", appliesTo: "all", ...over });

describe("roundTotal", () => {
  it("rounds to the nearest step", () => {
    expect(roundTotal(10.12, 0.05, "nearest")).toEqual({ total: 10.1, adjustment: -0.02 });
    expect(roundTotal(10.13, 0.05, "nearest")).toEqual({ total: 10.15, adjustment: 0.02 });
  });

  it("always rounds up when asked", () => {
    expect(roundTotal(10.01, 0.5, "up")).toEqual({ total: 10.5, adjustment: 0.49 });
    expect(roundTotal(10.01, 1, "up")).toEqual({ total: 11, adjustment: 0.99 });
  });

  it("always rounds down when asked", () => {
    expect(roundTotal(10.99, 1, "down")).toEqual({ total: 10, adjustment: -0.99 });
    expect(roundTotal(10.99, 0.1, "down")).toEqual({ total: 10.9, adjustment: -0.09 });
  });

  it("leaves a total that already sits on the step alone", () => {
    for (const unit of [1, 0.5, 0.1, 0.05, 0.01]) {
      expect(roundTotal(20, unit, "nearest").adjustment).toBe(0);
      expect(roundTotal(20, unit, "up").adjustment).toBe(0);
      expect(roundTotal(20, unit, "down").adjustment).toBe(0);
    }
  });

  it("handles a refund (negative) total on the number line", () => {
    expect(roundTotal(-10.12, 0.05, "nearest").total).toBe(-10.1);
    expect(roundTotal(-10.12, 0.1, "down").total).toBe(-10.2);
  });

  it("does nothing when the unit is missing", () => {
    expect(roundTotal(10.123, 0, "nearest")).toEqual({ total: 10.12, adjustment: 0 });
  });
});

describe("applyRounding", () => {
  it("is inert while the feature is off", () => {
    expect(applyRounding(10.12, cfg({ enabled: false }), "cash")).toEqual({ total: 10.12, adjustment: 0 });
  });

  it("rounds every tender on 'all'", () => {
    expect(applyRounding(10.12, cfg(), "card").total).toBe(10.1);
  });

  it("rounds only cash bills on 'cash'", () => {
    const only = cfg({ appliesTo: "cash" });
    expect(applyRounding(10.12, only, "cash").total).toBe(10.1);
    expect(applyRounding(10.12, only, "card")).toEqual({ total: 10.12, adjustment: 0 });
  });

  it("falls back to sane defaults for an unset settings block", () => {
    expect(applyRounding(10.12, undefined, "cash")).toEqual({ total: 10.12, adjustment: 0 });
    expect(roundingOf(undefined).receiptLabel).toBe("Extra Discount");
  });
});

describe("showsRoundingLine", () => {
  it("shows only a round-down, and only when the toggle is on", () => {
    expect(showsRoundingLine(-0.02, cfg({ showOnReceipt: true }))).toBe(true);
    expect(showsRoundingLine(0.02, cfg({ showOnReceipt: true }))).toBe(false);
    expect(showsRoundingLine(0, cfg({ showOnReceipt: true }))).toBe(false);
    expect(showsRoundingLine(-0.02, cfg({ showOnReceipt: false }))).toBe(false);
    expect(showsRoundingLine(undefined, cfg({ showOnReceipt: true }))).toBe(false);
  });
});
