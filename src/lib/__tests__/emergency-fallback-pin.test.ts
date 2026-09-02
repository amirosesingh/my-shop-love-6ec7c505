import { describe, expect, it } from "vitest";

import {
  fallbackPinForSlot,
  fallbackSlotAt,
  verifyFallbackPin,
  FALLBACK_DRIFT_MINUTES,
} from "../emergency-fallback-pin";

describe("fallback emergency code", () => {
  it("is six digits and not the raw date string", async () => {
    const pin = await fallbackPinForSlot("202609020705");
    expect(pin).toMatch(/^\d{6}$/);
    expect("202609020705").not.toContain(pin);
  });

  it("accepts the code for the current minute", async () => {
    const now = Date.now();
    const pin = await fallbackPinForSlot(fallbackSlotAt(new Date(now)));
    await expect(verifyFallbackPin(pin, FALLBACK_DRIFT_MINUTES, now)).resolves.toBe(true);
  });

  it("tolerates a small clock difference", async () => {
    const now = Date.now();
    const pin = await fallbackPinForSlot(fallbackSlotAt(new Date(now - 2 * 60_000)));
    await expect(verifyFallbackPin(pin, FALLBACK_DRIFT_MINUTES, now)).resolves.toBe(true);
  });

  it("rejects a code from outside the drift window and malformed input", async () => {
    const now = Date.now();
    const stale = await fallbackPinForSlot(fallbackSlotAt(new Date(now - 30 * 60_000)));
    await expect(verifyFallbackPin(stale, FALLBACK_DRIFT_MINUTES, now)).resolves.toBe(false);
    await expect(verifyFallbackPin("12ab56", FALLBACK_DRIFT_MINUTES, now)).resolves.toBe(false);
  });

  it("changes every minute", async () => {
    const a = await fallbackPinForSlot("202609020705");
    const b = await fallbackPinForSlot("202609020706");
    expect(a).not.toBe(b);
  });
});
