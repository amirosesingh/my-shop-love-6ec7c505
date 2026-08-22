import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseSchemaManifest } = require("../../../electron/db/pool.cjs") as {
  parseSchemaManifest: (text: string) => {
    tables: Array<{ name: string; columns: Array<{ name: string }> }>;
    warnings: string[];
    tableBatches: Map<string, number[]>;
  };
};

describe("local SQL Server master schema", () => {
  const text = readFileSync(resolve(process.cwd(), "database/schema.sql"), "utf8");
  const manifest = parseSchemaManifest(text);

  it("parses the master file without unsupported column types", () => {
    expect(manifest.warnings).toEqual([]);
    expect(manifest.tables.length).toBeGreaterThanOrEqual(50);
  });

  it.each([
    ["payment_transactions", "client_transaction_id"],
    ["item_activity_logs", "quantity_delta"],
  ])("contains %s.%s and guarded batches", (table, column) => {
    const entry = manifest.tables.find((candidate) => candidate.name === table);
    expect(entry?.columns.some((candidate) => candidate.name === column)).toBe(true);
    expect(manifest.tableBatches.get(table)?.length).toBeGreaterThan(0);
  });
});