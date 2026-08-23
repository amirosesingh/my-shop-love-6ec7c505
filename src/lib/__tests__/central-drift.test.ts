import { describe, expect, it } from "vitest";
import {
  buildCentralRepairSql,
  centralExpectedSpecs,
  computeCentralDrift,
  type CentralDriftRow,
} from "../central-drift";
import type { CompareTableSpec } from "../data-compare";

const col = (name: string, type = "nvarchar(50)") => ({ name, type });

/** Master-schema fixture: the real file carries local-only extras per table. */
const manifest = new Map<string, { columns: { name: string; type: string }[] }>([
  [
    "sales",
    {
      columns: [
        col("id", "uniqueidentifier"),
        col("bill_number"),
        col("total_amount", "decimal(19,4)"),
        col("client_transaction_id"),
        col("created_at", "datetime2"),
        // Local-only columns that must never be expected centrally:
        col("updated_at", "datetime2"),
        col("branch_id", "uniqueidentifier"),
        col("is_synced", "bit"),
        col("sync_status"),
        col("last_error_at", "datetime2"),
      ],
    },
  ],
  [
    "payment_transactions",
    {
      columns: [
        col("id", "uniqueidentifier"),
        col("sale_id", "uniqueidentifier"),
        col("amount", "decimal(19,4)"),
        col("method"),
        col("client_transaction_id"),
        col("row_version", "int"),
        col("is_synced", "bit"),
        col("sync_status"),
        col("last_error_at", "datetime2"),
      ],
    },
  ],
  [
    "audit_logs",
    {
      columns: [
        col("id", "uniqueidentifier"),
        col("action"),
        col("details", "nvarchar(max)"),
        // Present in the local master schema but never pushed centrally:
        col("updated_at", "datetime2"),
        col("row_version", "int"),
        col("is_synced", "bit"),
        col("sync_status"),
        col("last_error_at", "datetime2"),
      ],
    },
  ],
  [
    "held_orders",
    {
      columns: [
        col("id", "uniqueidentifier"),
        col("label"),
        col("total", "decimal(19,4)"),
        // The till stamps one, but the sync contract does not send it:
        col("client_transaction_id"),
        col("is_synced", "bit"),
        col("sync_status"),
        col("last_error_at", "datetime2"),
      ],
    },
  ],
  ["sync_state", { columns: [col("id"), col("last_sync_at", "datetime2")] }],
]);

const compareSpecs: CompareTableSpec[] = [
  { table: "sales", label: "Sales", storeColumns: ["store_id"] },
  { table: "payment_transactions", label: "Payments" },
  { table: "audit_logs", label: "Audit log" },
  { table: "held_orders", label: "Held orders" },
  { table: "sync_state", label: "Sync state" },
];

const specs = centralExpectedSpecs(compareSpecs, manifest);

/** A central database that matches the expected contract exactly. */
const fullCloud = () =>
  new Map(specs.map((s) => [s.table, new Set(s.columns.map((c) => c.name.toLowerCase()))]));

/** The real drifted state: contract minus the five genuinely missing columns. */
const driftedCloud = () => {
  const cloud = fullCloud();
  cloud.get("payment_transactions")!.delete("client_transaction_id");
  cloud.get("pos_settings")!.delete("receipt_css");
  for (const c of ["require_pin_terminal_reset", "row_version", "updated_by"]) {
    cloud.get("pos_store_settings")!.delete(c);
  }
  return cloud;
};

describe("centralExpectedSpecs", () => {
  it("keeps only the columns the sync contract actually pushes", () => {
    const names = specs.find((s) => s.table === "sales")!.columns.map((c) => c.name);
    expect(names).toContain("client_transaction_id");
    for (const phantom of ["is_synced", "sync_status", "last_error_at", "updated_at", "branch_id"]) {
      expect(names).not.toContain(phantom);
    }
  });

  it("expects client_transaction_id on payment_transactions but not on held_orders", () => {
    expect(
      specs.find((s) => s.table === "payment_transactions")!.columns.map((c) => c.name),
    ).toContain("client_transaction_id");
    expect(
      specs.find((s) => s.table === "held_orders")!.columns.map((c) => c.name),
    ).not.toContain("client_transaction_id");
  });

  it("drops audit-log columns the central database never had", () => {
    const names = specs.find((s) => s.table === "audit_logs")!.columns.map((c) => c.name);
    expect(names).toContain("action");
    expect(names).not.toContain("updated_at");
    expect(names).not.toContain("row_version");
  });

  it("skips till-only tables and adds the central settings contract", () => {
    expect(specs.some((s) => s.table === "sync_state")).toBe(false);
    expect(specs.find((s) => s.table === "pos_settings")!.columns.map((c) => c.name)).toEqual([
      "receipt_css",
    ]);
    expect(
      specs
        .find((s) => s.table === "pos_store_settings")!
        .columns.map((c) => c.name)
        .sort(),
    ).toEqual(["require_pin_terminal_reset", "row_version", "updated_by"].sort());
  });
});

describe("computeCentralDrift", () => {
  it("flags exactly the real gaps in the drifted central database", () => {
    const drift = computeCentralDrift(specs, driftedCloud());
    const flagged = drift.filter((d) => d.missingTable || d.missingColumns.length);
    expect(flagged.map((d) => d.table).sort()).toEqual(
      ["payment_transactions", "pos_settings", "pos_store_settings"].sort(),
    );
    expect(
      flagged.find((d) => d.table === "payment_transactions")!.missingColumns.map((c) => c.name),
    ).toEqual(["client_transaction_id"]);
    expect(
      flagged
        .find((d) => d.table === "pos_store_settings")!
        .missingColumns.map((c) => c.name)
        .sort(),
    ).toEqual(["require_pin_terminal_reset", "row_version", "updated_by"].sort());
  });

  it("reports a fully repaired central database as clean", () => {
    const drift = computeCentralDrift(specs, fullCloud());
    expect(drift.every((d) => !d.missingTable && d.missingColumns.length === 0)).toBe(true);
  });

  it("marks an absent central table as a missing table", () => {
    const cloud = fullCloud();
    cloud.delete("payment_transactions");
    const drift = computeCentralDrift(specs, cloud);
    const row = drift.find((d) => d.table === "payment_transactions")!;
    expect(row.missingTable).toBe(true);
    expect(row.missingColumns.length).toBeGreaterThan(0);
  });
});

describe("buildCentralRepairSql", () => {
  const drifted = (): CentralDriftRow[] => computeCentralDrift(specs, driftedCloud());

  it("emits additive statements, the payment idempotency index and a schema reload", () => {
    const script = buildCentralRepairSql(drifted(), new Date("2026-08-23T00:00:00.000Z"));
    expect(script.ok).toBe(true);
    if (!script.ok) return;
    expect(script.sql).toContain(
      'alter table public."payment_transactions" add column if not exists "client_transaction_id" text;',
    );
    expect(script.sql).toContain(
      "alter table public.\"pos_settings\" add column if not exists \"receipt_css\" text not null default '';",
    );
    expect(script.sql).toContain(
      'alter table public."pos_store_settings" add column if not exists "require_pin_terminal_reset" boolean;',
    );
    expect(script.sql).toContain(
      'alter table public."pos_store_settings" add column if not exists "row_version" integer not null default 1;',
    );
    expect(script.sql).toContain(
      'alter table public."pos_store_settings" add column if not exists "updated_by" text;',
    );
    expect(script.sql).toContain(
      'create unique index if not exists "payment_transactions_client_transaction_id_uidx" on public.payment_transactions (client_transaction_id) where client_transaction_id is not null;',
    );
    expect(script.sql).toContain("notify pgrst, 'reload schema';");
    expect(script.sql).toContain("2026-08-23T00:00:00.000Z");
  });

  it("omits the payment index when the column is already present", () => {
    const cloud = fullCloud();
    cloud.get("pos_settings")!.delete("receipt_css");
    const script = buildCentralRepairSql(computeCentralDrift(specs, cloud));
    expect(script.ok).toBe(true);
    if (!script.ok) return;
    expect(script.sql).not.toContain("payment_transactions_client_transaction_id_uidx");
  });

  it("refuses to generate a script while a table is missing", () => {
    const cloud = fullCloud();
    cloud.delete("payment_transactions");
    const script = buildCentralRepairSql(computeCentralDrift(specs, cloud));
    expect(script.ok).toBe(false);
    if (script.ok) return;
    expect(script.missingTables).toContain("payment_transactions");
  });

  it("reports nothing to repair when the central database matches", () => {
    const script = buildCentralRepairSql(computeCentralDrift(specs, fullCloud()));
    expect(script.ok).toBe(false);
    if (script.ok) return;
    expect(script.missingTables).toEqual([]);
  });
});
