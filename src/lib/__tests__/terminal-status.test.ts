import { describe, expect, it } from "vitest";

import { sinceWords, terminalStatus } from "@/lib/terminal-status";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("terminal status", () => {
  it("is online while the device checked in recently", () => {
    expect(terminalStatus({ status: "used", lastSeenAt: ago(30_000) }, NOW)).toBe("online");
  });

  it("goes stale before it goes offline", () => {
    expect(terminalStatus({ status: "used", lastSeenAt: ago(5 * 60_000) }, NOW)).toBe("stale");
    expect(terminalStatus({ status: "used", lastSeenAt: ago(60 * 60_000) }, NOW)).toBe("offline");
  });

  it("reports a revoked device as disconnected even if it just checked in", () => {
    expect(terminalStatus({ status: "revoked", lastSeenAt: ago(1000) }, NOW)).toBe("revoked");
  });

  it("separates a code nobody has used from a device that went quiet", () => {
    expect(terminalStatus({ status: "active", lastSeenAt: null }, NOW)).toBe("not-activated");
    expect(terminalStatus({ status: "used", lastSeenAt: null }, NOW)).toBe("offline");
    expect(
      terminalStatus({ status: "active", lastSeenAt: null, activatedAt: ago(9_000_000) }, NOW),
    ).toBe("offline");
  });

  it("says how long ago in plain words", () => {
    expect(sinceWords(null, NOW)).toBe("");
    expect(sinceWords(ago(10_000), NOW)).toBe("just now");
    expect(sinceWords(ago(60_000), NOW)).toBe("1 minute ago");
    expect(sinceWords(ago(3 * 3_600_000), NOW)).toBe("3 hours ago");
    expect(sinceWords(ago(2 * 86_400_000), NOW)).toBe("2 days ago");
  });
});
