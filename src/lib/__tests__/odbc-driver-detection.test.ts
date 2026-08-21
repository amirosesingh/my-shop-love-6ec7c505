/**
 * The ODBC registry parser decides which drivers the Windows-auth ladder will
 * try. Matching the whole dump as one string used to make the generic "SQL
 * Server" driver look installed on every PC, which burned the connection
 * budget on attempts that could never sign in.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseOdbcRegistry } = require("../../../electron/db/pool.cjs") as {
  parseOdbcRegistry: (dump: string) => string[];
};

const DUMP = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers
    SQL Server    REG_SZ    Installed
    ODBC Driver 18 for SQL Server    REG_SZ    Installed
    ODBC Driver 13 for SQL Server    REG_SZ    Not installed
`;

describe("parseOdbcRegistry", () => {
  it("returns only drivers marked as installed", () => {
    const names = parseOdbcRegistry(DUMP);
    expect(names).toContain("ODBC Driver 18 for SQL Server");
    expect(names).toContain("SQL Server");
    expect(names).not.toContain("ODBC Driver 13 for SQL Server");
  });

  it("ignores the key header and blank lines", () => {
    expect(parseOdbcRegistry(DUMP).some((n) => n.startsWith("HKEY_"))).toBe(false);
  });

  it("survives an empty or unreadable dump", () => {
    expect(parseOdbcRegistry("")).toEqual([]);
    expect(parseOdbcRegistry(undefined as unknown as string)).toEqual([]);
  });
});
