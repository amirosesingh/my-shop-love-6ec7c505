import { describe, expect, it } from "vitest";

import { pinForSlot, slotAt, verifyPinWithSecret, PIN_DRIFT_MINUTES } from "../emergency-pin";

const SECRET = "a".repeat(64);

describe("emergency access PIN", () => {
  it("renders the device minute as a YYYYMMDDHHmm slot", () => {
    const d = new Date(2026, 8, 2, 7, 5); // local time on purpose
    expect(slotAt(d)).toBe("202609020705");
  });

  it("derives six digits that are not the raw date string", async () => {
    const pin = await pinForSlot(SECRET, "202609020705");
    expect(pin).toMatch(/^\d{6}$/);
    expect("202609020705").not.toContain(pin);
  });

  it("accepts the code for the current minute", async () => {
    const now = Date.now();
    const pin = await pinForSlot(SECRET, slotAt(new Date(now)));
    await expect(verifyPinWithSecret(SECRET, pin, PIN_DRIFT_MINUTES, now)).resolves.toBe(true);
  });

  it("tolerates a small clock difference", async () => {
    const now = Date.now();
    const pin = await pinForSlot(SECRET, slotAt(new Date(now - 2 * 60_000)));
    await expect(verifyPinWithSecret(SECRET, pin, PIN_DRIFT_MINUTES, now)).resolves.toBe(true);
  });

  it("rejects a code from outside the drift window", async () => {
    const now = Date.now();
    const pin = await pinForSlot(SECRET, slotAt(new Date(now - 30 * 60_000)));
    await expect(verifyPinWithSecret(SECRET, pin, PIN_DRIFT_MINUTES, now)).resolves.toBe(false);
  });

  it("rejects another device's code and malformed input", async () => {
    const now = Date.now();
    const other = await pinForSlot("b".repeat(64), slotAt(new Date(now)));
    await expect(verifyPinWithSecret(SECRET, other, PIN_DRIFT_MINUTES, now)).resolves.toBe(false);
    await expect(verifyPinWithSecret(SECRET, "12ab56", PIN_DRIFT_MINUTES, now)).resolves.toBe(false);
  });
});
