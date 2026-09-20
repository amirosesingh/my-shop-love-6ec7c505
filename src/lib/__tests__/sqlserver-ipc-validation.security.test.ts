import { describe, expect, it } from "vitest";

describe("SQL Server IPC validation", () => {
  it("accepts only an explicit hostname and TCP port", async () => {
    const guard = await import("../../../electron/ipc-guard.cjs");
    const base = { host: "127.0.0.1", port: 1433, database: "", authMode: "windows", username: "", password: "", encrypt: true, trustServerCertificate: true, connectionTimeoutMs: 15000, requestTimeoutMs: 30000 };
    expect(guard.databaseProfile(base)).toMatchObject({ host: "127.0.0.1", port: 1433 });
    for (const bad of [
      { ...base, host: "localhost\\SQLEXPRESS" },
      { ...base, host: "" },
      { ...base, port: 0 },
      { ...base, port: 65536 },
      { ...base, authMode: "other" },
      { ...base, requestTimeoutMs: 999999 },
    ]) expect(() => guard.databaseProfile(bad)).toThrow();
  });
});
