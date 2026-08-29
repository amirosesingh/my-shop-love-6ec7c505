import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCloudSql,
  buildLocalSql,
  generateMigration,
  loadMigrations,
  markApplied,
  migrationFilename,
  newGaps,
  reconcileApplied,
  type SchemaGap,
} from "../schema-health";

const gap = (over: Partial<SchemaGap> = {}): SchemaGap => ({
  environment: "cloud",
  table: "sales",
  columns: ["client_transaction_id"],
  missingTable: false,
  ...over,
});

describe("schema health", () => {
  beforeEach(() => window.localStorage.clear());

  it("names files per environment and version", () => {
    const at = new Date("2026-08-29T00:00:00Z");
    expect(migrationFilename("cloud", 7, at)).toBe("supabase_007_20260829.sql");
    expect(migrationFilename("local", 1, at)).toBe("local_001_20260829.sql");
  });

  it("never mixes cloud and local statements in one file", () => {
    const cloud = buildCloudSql([gap()], "supabase_001_20260829.sql");
    const local = buildLocalSql(
      [gap({ environment: "local", table: "sales", columns: ["seq"] })],
      "local_001_20260829.sql",
    );
    expect(cloud).toContain("add column if not exists");
    expect(cloud).not.toMatch(/ALTER TABLE dbo\./);
    expect(local).toContain("COL_LENGTH('dbo.sales'");
    expect(local).not.toContain("alter table public.");
  });

  it("records itself in a schema_migrations table in each database", () => {
    expect(buildCloudSql([gap()], "supabase_001_20260829.sql")).toContain(
      "insert into public.schema_migrations",
    );
    expect(buildLocalSql([gap({ environment: "local" })], "local_001_20260829.sql")).toContain(
      "INSERT INTO dbo.schema_migrations",
    );
  });

  it("only surfaces genuinely new gaps once a file covers them", () => {
    const gaps = [gap()];
    generateMigration("cloud", gaps);
    expect(newGaps(gaps)).toEqual([]);
    expect(newGaps([gap({ table: "members", columns: ["tier"] })])).toHaveLength(1);
  });

  it("auto-detects an applied file when its gaps disappear", () => {
    const file = generateMigration("cloud", [gap()])!;
    expect(loadMigrations()[0]?.appliedAt).toBeNull();
    reconcileApplied([]);
    expect(loadMigrations()[0]?.appliedAt).not.toBeNull();
    expect(markApplied(file.id)[0]?.appliedAt).not.toBeNull();
  });
});
