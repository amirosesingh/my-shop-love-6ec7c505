/**
 * The auto-installer touches the operator's machine, so every branch is proven
 * with injected helpers — no real download and no real msiexec ever runs here.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const driver = require("../../../electron/db/driver-install.cjs") as {
  listDrivers: (deps?: Record<string, unknown>) => {
    drivers: { id: string; name: string; installed: boolean }[];
  };
  installDriver: (id: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  urlAllowed: (url: string) => boolean;
  describeExit: (code: number) => { ok: boolean; code: string; restartRequired: boolean };
};

const GOOD_SHA = "b0fe5feb86975837c3297bf09e843c30241512aac4d10a4d40377c54039016bb";

function deps(over: Record<string, unknown> = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drvtest-"));
  return {
    platform: "win32",
    tmpDir,
    download: async (_url: string, target: string) => fs.writeFileSync(target, "msi"),
    hash: async () => GOOD_SHA,
    runInstaller: async () => ({ exitCode: 0 }),
    refreshDrivers: () => ["ODBC Driver 18 for SQL Server"],
    ...over,
  };
}

const install = (over: Record<string, unknown> = {}, id = "msodbcsql18") =>
  driver.installDriver(id, { deps: deps(over) });

describe("driver catalogue", () => {
  it("only accepts pinned Microsoft https URLs", () => {
    expect(driver.urlAllowed("https://download.microsoft.com/x.msi")).toBe(true);
    expect(driver.urlAllowed("http://download.microsoft.com/x.msi")).toBe(false);
    expect(driver.urlAllowed("https://evil.example.com/x.msi")).toBe(false);
  });

  it("marks catalogue entries the registry already reports", () => {
    const list = driver.listDrivers({ refreshDrivers: () => ["ODBC Driver 18 for SQL Server"] });
    const eighteen = list.drivers.find((d) => d.id === "msodbcsql18");
    expect(eighteen?.installed).toBe(true);
    expect(list.drivers.find((d) => d.id === "msodbcsql17")?.installed).toBe(false);
  });

  it("maps Windows installer exit codes", () => {
    expect(driver.describeExit(0)).toMatchObject({ ok: true, restartRequired: false });
    expect(driver.describeExit(3010)).toMatchObject({ ok: true, restartRequired: true });
    expect(driver.describeExit(1602)).toMatchObject({ ok: false, code: "ECANCELLED" });
    expect(driver.describeExit(1603)).toMatchObject({ ok: false, code: "EEXIT" });
  });
});

describe("installDriver", () => {
  it("installs and reports the refreshed driver list", async () => {
    const res = await install();
    expect(res).toMatchObject({ ok: true, code: "OK", exitCode: 0 });
    expect(res.installed).toContain("ODBC Driver 18 for SQL Server");
  });

  it("reports a restart when the installer asks for one", async () => {
    const res = await install({ runInstaller: async () => ({ exitCode: 3010 }) });
    expect(res).toMatchObject({ ok: true, code: "OK_RESTART", restartRequired: true });
  });

  it("surfaces a download failure with the manual fallback", async () => {
    const res = await install({
      download: async () => {
        throw new Error("HTTP 502");
      },
    });
    expect(res).toMatchObject({ ok: false, code: "EDOWNLOAD" });
    expect(String(res.manualUrl)).toContain("microsoft.com");
  });

  it("refuses to install when the checksum does not match", async () => {
    let ran = false;
    const res = await install({
      hash: async () => "0".repeat(64),
      runInstaller: async () => {
        ran = true;
        return { exitCode: 0 };
      },
    });
    expect(ran).toBe(false);
    expect(res).toMatchObject({ ok: false, code: "ECHECKSUM" });
  });

  it("explains a cancelled elevation prompt", async () => {
    const res = await install({ runInstaller: async () => ({ exitCode: 1602 }) });
    expect(res).toMatchObject({ ok: false, code: "ECANCELLED" });
  });

  it("keeps the raw exit code for any other installer failure", async () => {
    const res = await install({ runInstaller: async () => ({ exitCode: 1603 }) });
    expect(res).toMatchObject({ ok: false, code: "EEXIT", exitCode: 1603 });
  });

  it("does nothing outside Windows", async () => {
    const res = await install({ platform: "linux" });
    expect(res).toMatchObject({ ok: false, code: "EPLATFORM" });
  });

  it("rejects an unknown driver id", async () => {
    const res = await install({}, "not-a-driver");
    expect(res).toMatchObject({ ok: false, code: "ENOENTRY" });
  });

  it("deletes the temp installer once it is done", async () => {
    const d = deps();
    await driver.installDriver("msodbcsql18", { deps: d });
    expect(fs.existsSync(path.join(d.tmpDir as string, "msodbcsql18.msi"))).toBe(false);
  });
});
