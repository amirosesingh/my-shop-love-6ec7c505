import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLocalStaffStore } = require("../../../electron/local-staff-store.cjs");

function fixture() {
  const values = new Map<string, unknown>();
  const config = {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: unknown) => { values.set(key, value); return { ok: true }; },
  };
  return { values, store: createLocalStaffStore(config) };
}

describe("offline terminal operations", () => {
  it("stores only a salted verifier and verifies a cached manager PIN", () => {
    const { values, store } = fixture();
    expect(store.cache([{ id: "m1", user_id: "manager", full_name: "Manager", role_slug: "manager", store_id: "s1", is_active: true }])).toMatchObject({ ok: true });
    expect(store.remember("manager", "2468")).toMatchObject({ ok: true });
    const serialized = JSON.stringify(values.get("offlineStaffCredentials"));
    expect(serialized).not.toContain("2468");
    expect(serialized).toContain("scrypt:");
    expect(store.verify("manager", "2468")).toMatchObject({
      ok: true,
      staff: { id: "m1", role_slug: "manager", store_id: "s1" },
    });
  });

  it("locks repeated wrong offline PIN attempts", () => {
    const { store } = fixture();
    store.cache([{ id: "a1", user_id: "admin", role_slug: "admin", is_active: true }]);
    store.remember("admin", "1357");
    for (let attempt = 0; attempt < 5; attempt += 1) store.verify("admin", "0000");
    expect(store.verify("admin", "1357")).toMatchObject({ ok: false, reason: "locked" });
  });

  it("wires reconnect sync and local approval through Electron", () => {
    const main = readFileSync("electron/main.cjs", "utf8");
    const preload = readFileSync("electron/preload.cjs", "utf8");
    const dialog = readFileSync("src/platforms/web/components/pos/AuthorizationDialog.tsx", "utf8");
    expect(main).toContain('ipcMain.handle("sync:auto"');
    expect(preload).toContain('auto: () => invoke("sync:auto")');
    expect(preload).toContain('verifyStaffPin: (username, pin) => invoke("staff:verify-pin"');
    expect(preload).toContain('rememberStaffPin: (username, pin) => invoke("staff:enroll"');
    expect(main).toContain('/api/public/cashier-login');
    expect(dialog).toContain("await verifyLocalPin(authorizerId.trim(), pin)");
    expect(dialog).toContain('mode_used: "offline_pin"');
  });
});
