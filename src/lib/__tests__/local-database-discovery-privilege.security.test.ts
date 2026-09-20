import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Load both Electron modules through the same CommonJS cache: the privilege
// module deliberately owns the singleton session used by the desktop process.
const require = createRequire(import.meta.url);
const adminSession = require("../../../electron/admin-session.cjs");
const privilege = require("../../../electron/ipc-privilege.cjs");

const DATABASE_ADMIN_CHANNELS = [
  "database:set-enabled",
  "database:test-server",
  "database:list-databases",
  "database:validate",
  "database:migrate",
  "database:save-connect",
  "database:disconnect",
  "database:remove-configuration",
  "database:backup",
  "database:restore",
] as const;

describe("local SQL Server discovery privilege", () => {
  beforeEach(() => adminSession.clear());

  it("explicitly classifies discovery as open", () => {
    expect(privilege.CHANNEL_LEVELS["database:list-servers"]).toBe(privilege.OPEN);
    expect(privilege.levelFor("database:list-servers")).toBe(privilege.OPEN);
  });

  it("allows discovery without an admin session, including a cashier/staff session", () => {
    expect(adminSession.status()).toMatchObject({ unlocked: false });
    expect(privilege.allowed("database:list-servers")).toBe(true);

    // Cashiers have no desktop privilege grant; discovery must remain available.
    expect(privilege.allowed("database:list-servers")).toBe(true);
    expect(adminSession.status()).toMatchObject({ unlocked: false });
  });

  it("allows an admin session to discover without changing or consuming the session", () => {
    adminSession.grant("admin", "admin-user");

    expect(privilege.allowed("database:list-servers")).toBe(true);
    expect(adminSession.status()).toMatchObject({
      unlocked: true,
      level: "admin",
      subject: "admin-user",
    });
  });

  it("runs the discovery handler without requiring or mutating configuration", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
        handlers.set(channel, listener);
      }),
    };
    privilege.install(ipcMain);
    const configuration = { enabled: false, configured: false, host: "manual-host" };
    const discover = vi.fn(async () => ({
      ok: true,
      servers: [{ host: "localhost", label: "localhost", status: "running" }],
    }));
    ipcMain.handle("database:list-servers", discover);

    const result = await handlers.get("database:list-servers")?.({});

    expect(discover).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, servers: [{ host: "localhost" }] });
    expect(configuration).toEqual({ enabled: false, configured: false, host: "manual-host" });
    expect(adminSession.status()).toMatchObject({ unlocked: false });
  });

  it("keeps every database configuration and write channel administrator-only", () => {
    for (const channel of DATABASE_ADMIN_CHANNELS) {
      expect(privilege.CHANNEL_LEVELS[channel], channel).toBe(privilege.ADMIN);
      expect(privilege.allowed(channel), channel).toBe(false);
    }
  });

  it("lets an adopted admin perform writes but refuses managers and cashiers", () => {
    adminSession.grant("admin", "signed-in-admin");
    expect(privilege.allowed("database:save-connect")).toBe(true);

    adminSession.grant("supervisor", "signed-in-manager");
    expect(privilege.allowed("database:save-connect")).toBe(false);

    adminSession.clear();
    expect(privilege.allowed("database:save-connect")).toBe(false);
    expect(privilege.refusal(privilege.ADMIN)).toMatchObject({
      ok: false,
      code: "EPRIVILEGE",
      requiredLevel: "admin",
    });
  });

  it("keeps privileged retries wired to server-verified session adoption", () => {
    const gate = readFileSync("src/platforms/windows/components/PrivilegeGate.tsx", "utf8");
    const main = readFileSync("electron/main.cjs", "utf8");
    const adoptRoute = readFileSync("src/routes/api/v1/pos/ipc-adopt.ts", "utf8");

    expect(gate).toContain("await window.sqlAdmin?.adoptSession?.(await readCredentials())");
    expect(gate).toContain('can("can_manage_sync_backup")');
    expect(gate).toContain('requiredLevel === "admin" && adopted.level !== "admin"');
    expect(main).toContain('ipcMain.handle("admin:adopt-session"');
    expect(adoptRoute).toContain("verifyRelayCaller(proof)");
    expect(adoptRoute).toContain("sessionToken:");
    expect(adoptRoute).toContain("cashierToken:");
    expect(adoptRoute).not.toMatch(/role\s*:\s*input/);
  });
});
