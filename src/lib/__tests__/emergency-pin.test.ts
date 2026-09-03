import { describe, expect, it } from "vitest";

import {
  EMERGENCY_CODE_LENGTH,
  emergencyCodeAt,
  verifyEmergencyCode,
  PIN_DRIFT_MINUTES,
} from "../emergency-pin";

describe("emergency access code", () => {
  it("is the device minute as YYYYMMDDHHmm in local time", () => {
    const d = new Date(2026, 8, 2, 7, 5);
    expect(emergencyCodeAt(d)).toBe("202609020705");
    expect(EMERGENCY_CODE_LENGTH).toBe(12);
  });

  it("accepts the code for the current minute", () => {
    const now = Date.now();
    expect(verifyEmergencyCode(emergencyCodeAt(new Date(now)), PIN_DRIFT_MINUTES, now)).toBe(true);
  });

  it("tolerates one minute either side", () => {
    const now = Date.now();
    for (const offset of [-60_000, 60_000]) {
      const code = emergencyCodeAt(new Date(now + offset));
      expect(verifyEmergencyCode(code, PIN_DRIFT_MINUTES, now)).toBe(true);
    }
  });

  it("rejects a code from outside the window", () => {
    const now = Date.now();
    const stale = emergencyCodeAt(new Date(now - 5 * 60_000));
    expect(verifyEmergencyCode(stale, PIN_DRIFT_MINUTES, now)).toBe(false);
  });

  it("rejects malformed input", () => {
    const now = Date.now();
    expect(verifyEmergencyCode("2026090207", PIN_DRIFT_MINUTES, now)).toBe(false);
    expect(verifyEmergencyCode("20260902070a", PIN_DRIFT_MINUTES, now)).toBe(false);
    expect(verifyEmergencyCode("", PIN_DRIFT_MINUTES, now)).toBe(false);
  });
});
