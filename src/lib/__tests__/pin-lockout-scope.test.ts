import { beforeEach, describe, expect, it } from "vitest";

import { attemptsLeft, clearPinFailures, lockoutRemaining, notePinFailure } from "../pin-lockout";

describe("keypad lockouts are per keypad", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("a locked cashier keypad leaves emergency access open", () => {
    for (let i = 0; i < 5; i += 1) notePinFailure("cashier");
    expect(lockoutRemaining("cashier")).toBeGreaterThan(0);
    expect(lockoutRemaining("recovery")).toBe(0);
    expect(attemptsLeft("recovery")).toBe(5);
  });

  it("wrong recovery codes never lock the till keypad", () => {
    for (let i = 0; i < 5; i += 1) notePinFailure("recovery");
    expect(lockoutRemaining("recovery")).toBeGreaterThan(0);
    expect(lockoutRemaining("cashier")).toBe(0);
  });

  it("clearing one scope leaves the other alone", () => {
    notePinFailure("cashier");
    notePinFailure("recovery");
    clearPinFailures("recovery");
    expect(attemptsLeft("recovery")).toBe(5);
    expect(attemptsLeft("cashier")).toBe(4);
  });
});
