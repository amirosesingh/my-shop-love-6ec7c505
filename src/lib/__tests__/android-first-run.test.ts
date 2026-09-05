/**
 * A freshly installed phone must say what is actually wrong.
 *
 * Before this, an unconfigured terminal reported "invalid login credentials"
 * and "that PIN was not recognised" — both of which send people hunting for a
 * password that was never the problem. These checks pin the classification
 * that keeps the two apart.
 */
import { describe, expect, it } from "vitest";

import {
  failureFromProbeError,
  isConfigurationFailure,
  loginFailureMessage,
} from "@/lib/login-failure";

describe("saved-connection probe", () => {
  it("treats a permission refusal as a healthy connection", () => {
    // The table exists and the database said "not for you" — exactly what a
    // signed-out read should get, so the password may now be trusted.
    expect(failureFromProbeError({ code: "42501", message: "permission denied" })).toBeUndefined();
    expect(failureFromProbeError(null)).toBeUndefined();
  });

  it("names a terminal pointed at a database without the POS tables", () => {
    expect(failureFromProbeError({ code: "PGRST205", message: "" })).toBe("cloud-schema-missing");
    expect(
      failureFromProbeError({ message: 'relation "app_users" does not exist' }),
    ).toBe("cloud-schema-missing");
  });

  it("names a wrong or missing key rather than blaming the password", () => {
    const code = failureFromProbeError({ message: "Invalid API key" });
    expect(code).toBe("configuration-invalid");
    expect(isConfigurationFailure(code!)).toBe(true);
  });

  it("names an unreachable company system", () => {
    expect(failureFromProbeError({ message: "Failed to fetch" })).toBe("cloud-unreachable");
  });

  it("never leaks a key or token in the wording shown to staff", () => {
    for (const code of [
      "configuration-required",
      "configuration-invalid",
      "cloud-unreachable",
      "cloud-schema-missing",
    ] as const) {
      const text = loginFailureMessage(code);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/eyJ|sb_publishable|supabase\.co|apikey/i);
    }
  });
});
