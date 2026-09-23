import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const packagedRegistry = require("../../../electron/db/schema-registry.cjs");

describe("SQL Server schema registry", () => {
  const registry = JSON.parse(readFileSync("database/sqlserver/schema-registry.json", "utf8"));
  const sql = readFileSync("database/sqlserver/schema.sql", "utf8");

  it("loads through the same path used by the packaged desktop validator", () => {
    expect(packagedRegistry.loadRegistry().tables).toHaveLength(67);
    expect(packagedRegistry.registryPath().replaceAll("\\", "/")).toMatch(
      /database\/sqlserver\/schema-registry\.json$/,
    );
  });

  it("maps every cloud domain table and column", () => {
    expect(registry.tables).toHaveLength(67);
    expect(registry.tables.reduce((sum: number, table: { columns: unknown[] }) => sum + table.columns.length, 0)).toBeGreaterThanOrEqual(995);
    expect(registry.tables.find((table: { cloudTable: string }) => table.cloudTable === "sale_items").columns.some((column: { cloudColumn: string }) => column.cloudColumn === "refunded_qty")).toBe(true);
    for (const table of registry.tables) {
      expect(table.sqlServerTable).toBe(table.cloudTable);
      expect(table.deleteRule).toBeTruthy();
      expect(table.conflictRule).toBeTruthy();
      expect(table.testName).toBeTruthy();
    }
  });

  it("uses change tracking and metadata-only synchronization tables", () => {
    expect(sql).toContain("SET CHANGE_TRACKING = ON");
    expect(sql).toContain("dbo.sync_checkpoints");
    expect(sql).toContain("dbo.sync_change_journal");
    expect(sql).not.toMatch(/sync_change_journal[\s\S]{0,1000}\bpayload\b/i);
  });

  it("records key metadata and generated migration support", () => {
    expect(sql).toContain("dbo.pos_schema_migrations");
    expect(sql).toContain("dbo.local_operation_receipts");
    expect(sql).toContain("FOREIGN KEY");
    expect(registry.tables.some((table: { columns: Array<{ foreignKey: boolean; foreignKeyTarget?: unknown }> }) => table.columns.some((column) => column.foreignKey && column.foreignKeyTarget))).toBe(true);
  });

  it("orders every foreign-key parent before its children", () => {
    const byName = new Map(registry.tables.map((table: { cloudTable: string }) => [table.cloudTable, table]));
    for (const table of registry.tables) {
      for (const column of table.columns.filter((item: { foreignKeyTarget?: { table: string } | null }) => item.foreignKeyTarget?.table && item.foreignKeyTarget.table !== table.cloudTable)) {
        const parent = byName.get(column.foreignKeyTarget.table) as { dependencyOrder: number } | undefined;
        expect(parent?.dependencyOrder).toBeLessThan(table.dependencyOrder);
      }
    }
  });
});
