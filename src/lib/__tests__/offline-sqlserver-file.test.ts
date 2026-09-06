import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { build } = require("../../../scripts/build-offline-sql.cjs") as {
  build: () => string;
};
const { parseSchemaManifest } = require("../../../electron/db/pool.cjs") as {
  parseSchemaManifest: (text: string) => {
    tables: Array<{ name: string; columns: Array<{ name: string }> }>;
    warnings: string[];
  };
};

const OUT = "db/offline/pos-offline-sqlserver.sql";
const readRoot = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("hand-run SQL Server file", () => {
  const current = readRoot(OUT);

  it("is in step with database/schema.sql", () => {
    // Regenerate with: node scripts/build-offline-sql.cjs
    expect(current).toBe(build());
  });

  it("carries every table the master schema defines", () => {
    const tablesOf = (text: string) =>
      new Set([...text.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((m) => m[1]));
    const master = tablesOf(readRoot("database/schema.sql"));
    const missing = [...master].filter((name) => !tablesOf(current).has(name));
    expect(missing).toEqual([]);
  });

  it("creates the database and the till-only tables", () => {
    expect(current).toContain("IF DB_ID('POS_LOCAL') IS NULL");
    expect(current).toContain("CREATE TABLE dbo.offline_sync_queue");
    expect(current).toContain("CREATE TABLE dbo.pos_store_settings");
  });

  it("parses without unsupported column types", () => {
    expect(parseSchemaManifest(current).warnings).toEqual([]);
  });
});
