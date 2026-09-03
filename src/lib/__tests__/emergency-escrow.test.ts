import { describe, expect, it } from "vitest";

import { codeForSlot, fingerprintOf, slotFor, secondsLeftInSlot } from "../emergency-escrow.server";
import { fallbackPinForSlot, fallbackSlotAt } from "../emergency-fallback-pin";
import { pinForSlot, slotAt } from "../emergency-pin";

const SECRET = "a".repeat(64);

describe("emergency code derivation", () => {
  it("server and terminal derive the same six digits", async () => {
    const slot = "202603140935";
    expect(codeForSlot(SECRET, slot)).toBe(await pinForSlot(SECRET, slot));
    expect(codeForSlot(SECRET, slot)).toMatch(/^\d{6}$/);
  });

  it("the master code uses the company salt on both sides", async () => {
    const salt = "b".repeat(64);
    const slot = "202603140935";
    expect(codeForSlot(salt, slot)).toBe(await fallbackPinForSlot(slot, salt));
  });

  it("the slot follows the till's own local time, not the server's", () => {
    const at = Date.UTC(2026, 2, 14, 9, 35);
    expect(slotFor(0, at)).toBe("202603140935");
    expect(slotFor(330, at)).toBe("202603141505");
  });

  it("the local slot helpers agree with each other", () => {
    const now = new Date(2026, 2, 14, 9, 35);
    expect(slotAt(now)).toBe(fallbackSlotAt(now));
  });

  it("the fingerprint is short, stable and not the secret", () => {
    const print = fingerprintOf(SECRET);
    expect(print).toHaveLength(8);
    expect(print).toBe(fingerprintOf(SECRET));
    expect(SECRET).not.toContain(print.toLowerCase());
  });

  it("a code lasts at most one minute", () => {
    expect(secondsLeftInSlot(Date.UTC(2026, 2, 14, 9, 35, 0))).toBe(60);
    expect(secondsLeftInSlot(Date.UTC(2026, 2, 14, 9, 35, 45))).toBe(15);
  });
});
