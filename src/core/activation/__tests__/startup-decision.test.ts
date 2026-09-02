import { describe, expect, it } from "vitest";

import { startupDecision } from "../registration-status";

const base = {
  registration: "registered" as const,
  verdict: "verified" as const,
  activated: true,
  graceOpen: true,
  offlineCapable: false,
};

describe("start-up decision", () => {
  it("lets a registered terminal in only when the connection is proven", () => {
    expect(startupDecision(base)).toBe("ready");
  });

  it("blocks login when the saved key is refused, even if activated", () => {
    expect(startupDecision({ ...base, verdict: "rejected" })).toBe("connect-database");
  });

  it("blocks login when nothing is configured", () => {
    expect(startupDecision({ ...base, verdict: "unconfigured" })).toBe("connect-database");
  });

  it("sends a proven-but-unregistered terminal to activation", () => {
    expect(startupDecision({ ...base, activated: false, registration: "not-registered" })).toBe(
      "activate",
    );
  });

  it("Android: unreachable means blocked, never a silent local login", () => {
    expect(startupDecision({ ...base, verdict: "unreachable" })).toBe("offline-blocked");
  });

  it("Windows: a registered till inside its grace window may sign in offline", () => {
    expect(
      startupDecision({ ...base, verdict: "unreachable", offlineCapable: true }),
    ).toBe("ready");
  });

  it("Windows: an expired grace window blocks the till", () => {
    expect(
      startupDecision({
        ...base,
        verdict: "unreachable",
        offlineCapable: true,
        graceOpen: false,
      }),
    ).toBe("offline-blocked");
  });

  it("an unactivated, unreachable device is asked for the database first", () => {
    expect(
      startupDecision({
        ...base,
        verdict: "unreachable",
        activated: false,
        registration: "not-registered",
      }),
    ).toBe("connect-database");
  });
});
