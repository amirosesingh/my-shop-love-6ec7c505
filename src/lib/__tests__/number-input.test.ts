import { describe, expect, it } from "vitest";
import { boundedInputNumber } from "@/lib/number-input";

describe("boundedInputNumber", () => {
  it("keeps the previous value for empty, invalid and non-finite input", () => {
    expect(boundedInputNumber("", 7)).toBe(7);
    expect(boundedInputNumber("not-a-number", 7)).toBe(7);
    expect(boundedInputNumber("Infinity", 7)).toBe(7);
  });

  it("clamps valid values and optionally rounds integers", () => {
    expect(boundedInputNumber("-2", 7, 0, 10)).toBe(0);
    expect(boundedInputNumber("12", 7, 0, 10)).toBe(10);
    expect(boundedInputNumber("4.6", 7, 0, 10, true)).toBe(5);
  });
});
