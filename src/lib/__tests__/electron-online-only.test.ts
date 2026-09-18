import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { platformFeatures } from "@/platform-config/features";

const read = (path: string) => readFileSync(path, "utf8");

describe("Electron online-only contract", () => {
  it("does not advertise local storage or offline-first writes", () => {
    expect(platformFeatures.windows.localDb).toBe(false);
    expect(platformFeatures.windows.offlineFirst).toBe(false);
  });

  it("exposes no database, migration or sync-worker IPC", () => {
    const main = read("electron/main.cjs");
    const preload = read("electron/preload.cjs");
    for (const source of [main, preload]) {
      expect(source).not.toMatch(/local:mirror|pos:apply-schema|sqladmin:|pos:sync-now/);
    }
  });

  it("redirects the retired sync page to database settings", () => {
    const route = read("src/routes/settings.sync.tsx");
    expect(route).toContain('redirect({ to: "/settings/database"');
    expect(route).not.toMatch(/SyncHub|SyncPanel|SyncSettings/);
  });
});
