/**
 * The desktop process — not the window — decides who may call a channel.
 * These run the real `electron/ipc-privilege.cjs` against a stubbed unlock.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);
const privilegePath = require_.resolve("../../../../electron/ipc-privilege.cjs");
const sessionPath = require_.resolve("../../../../electron/admin-session.cjs");

let level: string | null = null; // null = locked
let firstRun = false;
let recovery = false; // an Emergency Access session is open

type Privilege = {
  allowed: (channel: string, args?: unknown[]) => boolean;
  levelFor: (channel: string, args?: unknown[]) => string;
  settingLevel: (key: string) => string;
  install: (ipcMain: unknown, deps: { isFirstRun: () => boolean }) => void;
};

function load(): Privilege {
  delete require_.cache[privilegePath];
  require_.cache[sessionPath] = {
    id: sessionPath,
    filename: sessionPath,
    loaded: true,
    exports: {
      hasLevel: (want: string) =>
        level === "admin" || (level === "supervisor" && want === "supervisor"),
      touch: () => {},
      recoveryActive: () => recovery,
      recoveryTouch: () => {},
    },
  } as never;
  const mod = require_(privilegePath) as Privilege;
  mod.install({ handle: () => {} }, { isFirstRun: () => firstRun });
  return mod;
}

beforeEach(() => {
  level = null;
  firstRun = false;
  recovery = false;
  delete require_.cache[sessionPath];
});

describe("desktop channel privilege", () => {
  it("lets a locked till keep trading", () => {
    const p = load();
    for (const channel of ["pos:write", "db:create-sale", "print:silent", "staff:verify-pin"]) {
      expect(p.allowed(channel)).toBe(true);
    }
  });

  it("refuses connection, identity and audit changes while locked", () => {
    const p = load();
    for (const channel of [
      "backend:set",
      "cloud:set",
      "terminal:write",
      "local:audit-clear",
      "sqladmin:query",
      "pos:restore",
    ]) {
      expect(p.allowed(channel)).toBe(false);
    }
  });

  it("treats an unclassified channel as administrator-only", () => {
    const p = load();
    expect(p.levelFor("something:new")).toBe("admin");
    expect(p.allowed("something:new")).toBe(false);
  });

  it("separates supervisor work from administrator work", () => {
    const p = load();
    level = "supervisor";
    expect(p.allowed("pos:housekeep")).toBe(true);
    expect(p.allowed("local:rollback")).toBe(true);
    expect(p.allowed("backend:set")).toBe(false);
    level = "admin";
    expect(p.allowed("backend:set")).toBe(true);
  });

  it("classifies settings by what the setting decides", () => {
    const p = load();
    expect(p.settingLevel("ui_density")).toBe("open");
    expect(p.settingLevel("backend_url")).toBe("admin");
    expect(p.settingLevel("offline_grace_minutes")).toBe("admin");
    expect(p.settingLevel("supabase_key")).toBe("admin");
    expect(p.settingLevel("reorder_threshold")).toBe("supervisor");
    expect(p.allowed("settings:set", ["ui_density", "compact"])).toBe(true);
    expect(p.allowed("settings:set", ["backend_url", "http://evil"])).toBe(false);
  });

  it("lets an unconfigured till be set up, and closes that door once it is", () => {
    const p = load();
    firstRun = true;
    expect(p.allowed("cloud:set")).toBe(true);
    expect(p.allowed("terminal:write")).toBe(true);
    // Never a blanket opening: the database tools stay shut.
    expect(p.allowed("sqladmin:query")).toBe(false);
    firstRun = false;
    expect(p.allowed("cloud:set")).toBe(false);
  });

  it("lets Emergency Access repair a till without a supervisor sign-in", () => {
    const p = load();
    recovery = true;
    for (const channel of [
      "cloud:set",
      "backend:set",
      "terminal:write",
      "pos:connect",
      "config:set",
      "driver:install",
      "sqladmin:connect",
      "sqladmin:repair",
    ]) {
      expect(p.allowed(channel)).toBe(true);
    }
    expect(p.allowed("settings:set", ["offline_grace_days", "7"])).toBe(true);
  });

  it("keeps the audit trail, backups and app control out of Emergency Access", () => {
    const p = load();
    recovery = true;
    for (const channel of [
      "local:audit-clear",
      "pos:backup",
      "pos:restore",
      "health:quit",
      "health:rollback",
      "sqladmin:query",
      "staff:remember-pin",
    ]) {
      expect(p.allowed(channel)).toBe(false);
    }
  });

  it("closes the repair door when the recovery session ends", () => {
    const p = load();
    recovery = true;
    expect(p.allowed("cloud:set")).toBe(true);
    recovery = false;
    expect(p.allowed("cloud:set")).toBe(false);
  });

  it("runs the channel body only when the call is allowed", async () => {
    const p = load();
    const registered: Record<string, (e: unknown, ...a: unknown[]) => unknown> = {};
    const ipcMain = {
      handle: (channel: string, listener: (e: unknown, ...a: unknown[]) => unknown) => {
        registered[channel] = listener;
      },
    };
    p.install(ipcMain, { isFirstRun: () => false });
    const body = vi.fn(() => ({ ok: true }));
    ipcMain.handle("backend:set", body);
    const refused = (await registered["backend:set"]({}, "http://evil")) as { code?: string };
    expect(refused.code).toBe("EPRIVILEGE");
    expect(body).not.toHaveBeenCalled();
    level = "admin";
    expect(await registered["backend:set"]({}, "http://ok")).toEqual({ ok: true });
    expect(body).toHaveBeenCalledTimes(1);
  });
});
