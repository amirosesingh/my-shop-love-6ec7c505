/**
 * Each audited rule must be decided by the register settings alone — with a
 * switched-on and a switched-off case, so a rule can never be silently
 * ignored again.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { blocksOutOfStockSale } from "@/lib/register/stock-guard";
import { effectiveLockSeconds, DEFAULT_AUTO_LOCK_SECONDS, setAutoLockSeconds } from "@/lib/auto-lock";
import { DEFAULT_POS_RULES, requiresManagerPin, GATE_RULE_KEY } from "@/lib/pos-rules";

describe("prevent negative stock sale", () => {
  it("blocks an out-of-stock item when the rule is on", () => {
    expect(blocksOutOfStockSale(0, true)).toBe(true);
  });
  it("allows it when the rule is off", () => {
    expect(blocksOutOfStockSale(0, false)).toBe(false);
  });
  it("never blocks an item that is in stock", () => {
    expect(blocksOutOfStockSale(3, true)).toBe(false);
  });
});

describe("idle auto-lock", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  it("uses the branch rule when it is confirmed", () => {
    setAutoLockSeconds(600);
    expect(effectiveLockSeconds(90)).toBe(90);
  });
  it("honours a rule of zero as 'never lock'", () => {
    expect(effectiveLockSeconds(0)).toBe(0);
  });
  it("falls back to the per-machine value while the rule is unconfirmed", () => {
    setAutoLockSeconds(600);
    expect(effectiveLockSeconds(undefined)).toBe(600);
  });
  it("falls back to the shipped default with nothing saved", () => {
    expect(effectiveLockSeconds(undefined)).toBe(DEFAULT_AUTO_LOCK_SECONDS);
  });
});

describe("manager PIN gates read the register settings", () => {
  it("asks for a PIN when the matching rule is on and not when it is off", () => {
    for (const action of Object.keys(GATE_RULE_KEY) as (keyof typeof GATE_RULE_KEY)[]) {
      const key = GATE_RULE_KEY[action];
      expect(requiresManagerPin({ ...DEFAULT_POS_RULES, [key]: true }, action)).toBe(true);
      expect(requiresManagerPin({ ...DEFAULT_POS_RULES, [key]: false }, action)).toBe(false);
    }
  });
});
