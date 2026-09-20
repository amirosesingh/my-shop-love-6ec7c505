import { describe, expect, it, vi } from "vitest";

describe("direct SQL Server backend", () => {
  it("builds an ODBC Driver 18 connection with an explicit host and TCP port", async () => {
    const mod = await import("../../../electron/db/connection-manager.cjs");
    const value = mod.connectionString({
      host: "127.0.0.1", port: 1433, database: "POS_LOCAL", authMode: "sql",
      username: "pos_user", password: "s}cret", encrypt: true,
      trustServerCertificate: false, connectionTimeoutMs: 15_000, requestTimeoutMs: 30_000,
    });
    expect(value).toContain("Driver={ODBC Driver 18 for SQL Server}");
    expect(value).toContain("Server=tcp:127.0.0.1,1433");
    expect(value).toContain("Database={POS_LOCAL}");
    expect(value).not.toMatch(/\\SQLEXPRESS|1434|Browser/);
    expect(value).toContain("PWD={s}}cret}");
  });

  it("tests master and closes its temporary pool", async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [{ version: "16", edition: "Express", login_name: "u", can_list_databases: 1 }] });
    const close = vi.fn().mockResolvedValue(undefined);
    class Pool {
      connect = vi.fn().mockResolvedValue(this);
      close = close;
      request = () => ({ query });
    }
    const { ConnectionManager } = await import("../../../electron/db/connection-manager.cjs");
    const manager = new ConnectionManager({ driver: { ConnectionPool: Pool } });
    const result = await manager.testServer({ host: "db", port: 1433, database: "", authMode: "windows", username: "", password: "", encrypt: true, trustServerCertificate: true, connectionTimeoutMs: 5000, requestTimeoutMs: 5000 });
    expect(result).toMatchObject({ ok: true, edition: "Express", loginName: "u", canListDatabases: true });
    expect(query).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("sanitizes authentication failures", async () => {
    class Pool { async connect() { throw new Error("Login failed for user 'secret-user' (18456)"); } async close() {} }
    const { ConnectionManager } = await import("../../../electron/db/connection-manager.cjs");
    const result = await new ConnectionManager({ driver: { ConnectionPool: Pool } }).testServer({ host: "db", port: 1433, database: "", authMode: "sql", username: "secret-user", password: "secret-pass", encrypt: true, trustServerCertificate: true, connectionTimeoutMs: 5000, requestTimeoutMs: 5000 });
    expect(result).toMatchObject({ ok: false, code: "EAUTH" });
    expect(JSON.stringify(result)).not.toContain("secret-user");
    expect(JSON.stringify(result)).not.toContain("secret-pass");
  });
});
