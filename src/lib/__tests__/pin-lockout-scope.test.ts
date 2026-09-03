import { beforeEach, describe, expect, it } from "vitest";

import { attemptsLeft, clearPinFailures, lockoutRemaining, notePinFailure } from "../pin-lockout";

/** Minimal storage: the module only ever reads/writes string keys. */
function installStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  };
}

describe("keypad lockouts are per keypad", () => {
  beforeEach(() => {
    installStorage();
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
