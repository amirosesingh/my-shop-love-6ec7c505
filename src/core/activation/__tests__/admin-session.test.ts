/**
 * The desktop database tools must be refused unless an administrator has
 * unlocked them on the machine itself. Hiding the screen in the window proves
 * nothing, so these run the real `electron/admin-session.cjs` against a stubbed
 * staff store.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);
const sessionPath = require_.resolve("../../../../electron/admin-session.cjs");
const staffPath = require_.resolve("../../../../electron/staff-auth.cjs");

type Staff = { username: string; full_name: string; role_slug?: string; permissions?: unknown };

let answer: { ok: boolean; staff?: Staff } = { ok: false };

function loadSession() {
  delete require_.cache[sessionPath];
  require_.cache[staffPath] = {
    id: staffPath,
    filename: staffPath,
    loaded: true,
    exports: { verifyPin: () => answer },
  } as never;
  return require_(sessionPath) as {
    unlock: (u: string, p: string) => { ok: boolean; error?: string };
    lock: () => void;
    unlocked: () => boolean;
    requireAdmin: (work: () => unknown) => Promise<{ ok: boolean; code?: string; error?: string }>;
    requireLevel: (work: () => unknown, level: string) => Promise<{ ok: boolean; code?: string }>;
    adoptVerified: (level: string, name: string) => { ok: boolean; level?: string };
  };
}

beforeEach(() => {
  answer = { ok: false };
  delete require_.cache[staffPath];
});

describe("desktop database administration", () => {
  it("refuses the tools before anyone unlocks them", async () => {
    const session = loadSession();
    const work = vi.fn();
    const res = await session.requireAdmin(work as () => unknown);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("EADMINLOCK");
    // Nothing may reach the database on a refused call.
    expect(work).not.toHaveBeenCalled();
  });

  it("refuses a cashier who signs in correctly but may not administer", async () => {
    answer = { ok: true, staff: { username: "sam", full_name: "Sam", role_slug: "cashier", permissions: [] } };
    const session = loadSession();
    const res = session.unlock("sam", "1234");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/may not administer/i);
    expect(session.unlocked()).toBe(false);
  });

  it("refuses a wrong PIN without saying which half was wrong", () => {
    answer = { ok: false };
    const session = loadSession();
    const res = session.unlock("admin", "0000");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/username or PIN/i);
  });

  it("lets an administrator through, and locks again on request", async () => {
    answer = { ok: true, staff: { username: "ann", full_name: "Ann", role_slug: "admin" } };
    const session = loadSession();
    expect(session.unlock("ann", "4321").ok).toBe(true);
    const res = await session.requireAdmin(async () => ({ ok: true, rows: 1 }));
    expect(res.ok).toBe(true);
    session.lock();
    expect(session.unlocked()).toBe(false);
    expect((await session.requireAdmin(async () => ({ ok: true }))).ok).toBe(false);
  });

  it("adopts a backend-verified Admin without another PIN", async () => {
    const session = loadSession();
    expect(session.adoptVerified("admin", "Online Admin")).toMatchObject({ ok: true, level: "admin" });
    expect(await session.requireAdmin(async () => ({ ok: true }))).toEqual({ ok: true });
  });

  it("limits an adopted Supervisor to supervisor-level work", async () => {
    const session = loadSession();
    session.adoptVerified("supervisor", "Floor Supervisor");
    expect(await session.requireLevel(async () => ({ ok: true }), "supervisor")).toEqual({ ok: true });
    expect((await session.requireAdmin(async () => ({ ok: true }))).ok).toBe(false);
  });
});
