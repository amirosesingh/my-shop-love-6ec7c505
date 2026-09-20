import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeServerHost,
  selectDiscoveredServer,
  validateServerEndpoint,
} from "../components/local-database-server";

// @ts-expect-error CommonJS Electron module has no declaration file.
import { discoverLocalSqlServers } from "../../../../electron/db/local-server-discovery.cjs";

describe("local SQL Server wizard server step", () => {
  it("accepts valid hostnames, localhost values, and IP addresses without a connection test", () => {
    for (const host of ["localhost", "SHOP-TILL", "sql.example.internal", "127.0.0.1", "[::1]"]) {
      expect(validateServerEndpoint(host, 1433)).toBeNull();
    }
  });

  it("normalizes whitespace before validation", () => {
    expect(normalizeServerHost("  localhost  ")).toBe("localhost");
    expect(validateServerEndpoint(normalizeServerHost("  127.0.0.1  "), 1433)).toBeNull();
  });

  it("keeps empty, malformed, named-instance, and invalid-port entries from advancing", () => {
    expect(validateServerEndpoint("", 1433)).toContain("Enter a SQL Server hostname");
    expect(validateServerEndpoint("not a host", 1433)).toContain("valid hostname");
    expect(validateServerEndpoint("localhost\\SQLEXPRESS", 1433)).toContain("Named instances");
    expect(validateServerEndpoint("localhost", 0)).toContain("TCP port");
  });

  it("populates the manual field when a discovered server is selected", () => {
    expect(selectDiscoveredServer({ host: "manual-host", port: 1433 }, {
      host: "  localhost ", label: "Localhost", status: "running",
    })).toEqual({ host: "localhost", port: 1433 });
  });

  it("returns safe local aliases only when the local default service is running", async () => {
    const result = await discoverLocalSqlServers({
      platform: "win32", hostname: "POS-01",
      run: (_file: string, _args: string[], _options: unknown, done: (error: Error | null, stdout?: string) => void) => done(null, "STATE              : 4  RUNNING"),
    });
    expect(result).toEqual({ ok: true, servers: [
      { host: "localhost", label: "localhost", status: "running" },
      { host: "127.0.0.1", label: "127.0.0.1", status: "running" },
      { host: "POS-01", label: "POS-01 (this computer)", status: "running" },
    ] });
  });

  it("reports supported error and empty-result scan states without probing a network", async () => {
    const empty = await discoverLocalSqlServers({
      platform: "win32", hostname: "POS-01",
      run: (_file: string, _args: string[], _options: unknown, done: (error: Error | null, stdout?: string) => void) => done(new Error("not installed"), ""),
    });
    expect(empty).toEqual({ ok: true, servers: [] });
    await expect(discoverLocalSqlServers({ platform: "linux" })).resolves.toMatchObject({ ok: false, servers: [] });
  });

  it("keeps manual entry available and presents scan loading, error, and empty states", () => {
    const wizard = readFileSync("src/platforms/windows/components/LocalDatabaseWizard.tsx", "utf8");
    expect(wizard).toContain('const [scanning, setScanning]');
    expect(wizard).toContain('scanning ? "Scanning…" : "Scan / Discover Servers"');
    expect(wizard).toContain("discoveryError");
    expect(wizard).toContain("You can always enter a hostname manually.");
  });

  it("preserves the seven-step wizard and keeps discovery separate from persistence", () => {
    const wizard = readFileSync("src/platforms/windows/components/LocalDatabaseWizard.tsx", "utf8");
    expect(wizard).toContain('const steps = ["Mode", "Server", "Authentication", "Test", "Database", "Validate", "Save"]');
    expect(wizard).toContain("const response = await database.listServers()");
    expect(wizard).toContain("selectDiscoveredServer(current, server)");
    expect(wizard).toContain("saveAndConnect(profile)");

    const scan = wizard.slice(wizard.indexOf("const scanServers"), wizard.indexOf("const ok ="));
    expect(scan).not.toContain("saveAndConnect");
    expect(scan).not.toContain("setEnabled");
    expect(scan).not.toContain("removeConfiguration");
  });
});
