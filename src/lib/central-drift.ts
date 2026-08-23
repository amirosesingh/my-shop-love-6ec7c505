/**
 * Central schema drift — compares the central (online) database against the
 * exact set of columns the app writes to it.
 *
 * Two authorities, one answer:
 *
 * - electron/db/cloud-columns.json — the per-table push allow-list the sync
 *   engine and relay actually send. The till's master schema carries extra
 *   local-only columns (is_synced, sync_status, updated_at, branch_id, …) and
 *   alternative names the central database never had; comparing those raised
 *   false "missing column" alarms. The push contract is the honest yardstick.
 * - CENTRAL_EXTRA_SPECS — columns the web app writes on the wide central
 *   settings tables. The till stores settings differently, so the master
 *   schema file cannot describe them; this list is verified against the
 *   reference central schema.
 */
import centralPushColumns from "../../electron/db/cloud-columns.json";
import type { CompareTableSpec } from "./data-compare";

export type CentralColumn = {
  name: string;
  /** Master-schema (SQL Server) type, when the column comes from the manifest. */
  type?: string;
  /** Exact PostgreSQL type — used for central-only columns with no local twin. */
  pgType?: string;
};

export type CentralTableSpec = {
  table: string;
  label: string;
  columns: CentralColumn[];
};

export type CentralDriftRow = {
  table: string;
  label: string;
  missingTable: boolean;
  missingColumns: CentralColumn[];
};

/** table → the exact columns pushed centrally (lowercase). */
const PUSH_COLUMNS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(centralPushColumns).map(([table, cols]) => [
    table,
    new Set(cols.map((c) => c.toLowerCase())),
  ]),
);

/**
 * Columns the web app writes on the wide central settings tables; the till
 * keeps settings in a different shape, so these have no master-schema twin.
 * Verified against the reference central database (2026-08).
 */
const CENTRAL_EXTRA_SPECS: CentralTableSpec[] = [
  {
    table: "pos_settings",
    label: "POS settings",
    columns: [{ name: "receipt_css", pgType: "text not null default ''" }],
  },
  {
    table: "pos_store_settings",
    label: "Branch settings",
    columns: [
      { name: "require_pin_terminal_reset", pgType: "boolean" },
      { name: "row_version", pgType: "integer not null default 1" },
      { name: "updated_by", pgType: "text" },
    ],
  },
];

/**
 * The tables and columns the central database must have: every synced table's
 * master-schema columns narrowed to the push contract, plus the central-only
 * settings columns. Till-only tables (no push entry) are skipped.
 */
export function centralExpectedSpecs(
  compareSpecs: CompareTableSpec[],
  manifestTables: Map<string, { columns: { name: string; type: string }[] }>,
): CentralTableSpec[] {
  const specs: CentralTableSpec[] = [];
  for (const spec of compareSpecs) {
    const local = manifestTables.get(spec.table);
    const push = PUSH_COLUMNS[spec.table];
    if (!local || !push) continue;
    specs.push({
      table: spec.table,
      label: spec.label,
      columns: local.columns
        .filter((c) => push.has(c.name.toLowerCase()))
        .map((c) => ({ name: c.name, type: c.type })),
    });
  }
  return [...specs, ...CENTRAL_EXTRA_SPECS];
}

/** Compare the expected contract with the central database's own column list. */
export function computeCentralDrift(
  specs: CentralTableSpec[],
  cloud: Map<string, Set<string>>,
): CentralDriftRow[] {
  return specs.map((spec) => {
    const present = cloud.get(spec.table);
    if (!present) {
      return {
        table: spec.table,
        label: spec.label,
        missingTable: true,
        missingColumns: spec.columns,
      };
    }
    return {
      table: spec.table,
      label: spec.label,
      missingTable: false,
      missingColumns: spec.columns.filter((c) => !present.has(c.name.toLowerCase())),
    };
  });
}

/** Master-schema (SQL Server) type → central database (PostgreSQL) type. */
export function pgType(mssqlType: string): string {
  const up = String(mssqlType ?? "").toUpperCase();
  if (up.startsWith("UNIQUEIDENTIFIER")) return "uuid";
  if (up.startsWith("BIGINT")) return "bigint";
  if (up.startsWith("SMALLINT") || up.startsWith("TINYINT")) return "smallint";
  if (up.startsWith("INT")) return "integer";
  if (up.startsWith("BIT")) return "boolean";
  if (/^(DECIMAL|NUMERIC)/.test(up)) return up.toLowerCase().replace("decimal", "numeric");
  if (up.startsWith("MONEY")) return "numeric(19,4)";
  if (up.startsWith("FLOAT")) return "double precision";
  if (up.startsWith("REAL")) return "real";
  if (/^DATETIME/.test(up)) return "timestamptz";
  if (up.startsWith("DATE")) return "date";
  if (up.startsWith("TIME")) return "time";
  if (up.startsWith("VARBINARY")) return "bytea";
  return "text";
}

/** Quote an identifier for the central (PostgreSQL) database. */
const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export type CentralRepairScript =
  | { ok: true; sql: string }
  | { ok: false; missingTables: string[] };

/**
 * Build the additive PostgreSQL repair script for the current drift. Every
 * statement is idempotent and data-preserving. A missing table blocks the
 * script: creating a table without its grants and row-security policies
 * would leave it unreachable, so that case needs the authoritative central
 * schema instead.
 */
export function buildCentralRepairSql(
  drift: CentralDriftRow[],
  generatedAt = new Date(),
): CentralRepairScript {
  const missingTables = drift.filter((d) => d.missingTable).map((d) => d.table);
  if (missingTables.length) return { ok: false, missingTables };

  const statements: string[] = [];
  for (const d of drift) {
    for (const c of d.missingColumns) {
      statements.push(
        `alter table public.${q(d.table)} add column if not exists ${q(c.name)} ${c.pgType ?? pgType(c.type ?? "")};`,
      );
    }
  }
  if (!statements.length) return { ok: false, missingTables: [] };

  // The payments idempotency key needs its lookup index so a retried push can
  // resolve an already-stored row instead of failing, matching the sales twin.
  if (
    drift.some(
      (d) =>
        d.table === "payment_transactions" &&
        d.missingColumns.some((c) => c.name.toLowerCase() === "client_transaction_id"),
    )
  ) {
    statements.push(
      `create unique index if not exists "payment_transactions_client_transaction_id_uidx" on public.payment_transactions (client_transaction_id) where client_transaction_id is not null;`,
    );
  }
  // Ask PostgREST to reload its schema cache so the new columns work at once.
  statements.push(`notify pgrst, 'reload schema';`);

  const lines = [
    "-- POS central schema repair",
    `-- Generated ${generatedAt.toISOString()} by the Schema manager.`,
    "-- Every statement is idempotent: safe to run repeatedly, never drops or rewrites data.",
    "-- Run once in the central project's PostgreSQL SQL editor, then re-check here.",
    "",
    ...statements,
    "",
  ];
  return { ok: true, sql: lines.join("\n") };
}
