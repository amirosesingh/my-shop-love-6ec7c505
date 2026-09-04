/**
 * The Emergency Access session in the desktop process.
 *
 * The window is not trusted: it says the operator typed a recovery code, and
 * the desktop process checks that code against its own clock before opening a
 * short repair session.
 */
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);
const sessionPath = require_.resolve("../../../../electron/admin-session.cjs");

type Session = {
  validRecoveryCode: (code: string, now?: number) => boolean;
  recoveryUnlock: (code: string) => { ok: boolean };
  recoveryLock: () => { ok: boolean };
  recoveryActive: () => boolean;
  RECOVERY_TTL_MS: number;
};

const clockCode = (date: Date) => {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
};

let session: Session;

beforeEach(() => {
  delete require_.cache[sessionPath];
  session = require_(sessionPath) as Session;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("emergency recovery session", () => {
  it("accepts this minute and one either side", () => {
    const now = Date.now();
    for (const offset of [-60_000, 0, 60_000]) {
      expect(session.validRecoveryCode(clockCode(new Date(now + offset)), now)).toBe(true);
    }
  });

  it("refuses a code from outside the window, and anything that is not twelve digits", () => {
    const now = Date.now();
    expect(session.validRecoveryCode(clockCode(new Date(now + 5 * 60_000)), now)).toBe(false);
    expect(session.validRecoveryCode("", now)).toBe(false);
    expect(session.validRecoveryCode("12345", now)).toBe(false);
    expect(session.validRecoveryCode("abcdefghijkl", now)).toBe(false);
  });

  it("opens on a correct code and grants nothing on a wrong one", () => {
    expect(session.recoveryActive()).toBe(false);
    expect(session.recoveryUnlock("000000000000").ok).toBe(false);
    expect(session.recoveryActive()).toBe(false);
    expect(session.recoveryUnlock(clockCode(new Date())).ok).toBe(true);
    expect(session.recoveryActive()).toBe(true);
  });

  it("closes when the screen is left, and expires on its own", () => {
    session.recoveryUnlock(clockCode(new Date()));
    session.recoveryLock();
    expect(session.recoveryActive()).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    session.recoveryUnlock(clockCode(new Date()));
    expect(session.recoveryActive()).toBe(true);
    vi.advanceTimersByTime(session.RECOVERY_TTL_MS + 1000);
    expect(session.recoveryActive()).toBe(false);
  });
});
