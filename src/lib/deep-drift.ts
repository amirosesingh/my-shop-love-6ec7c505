/**
 * Deep schema comparison — everything the shallow table/column check cannot
 * see: nullability, defaults, primary keys, foreign keys, unique and check
 * constraints, indexes, triggers, row-level security and policies.
 *
 * The comparison stays one-way and additive. Objects found in the database
 * but absent from the authoritative definition are never repaired and never
 * dropped; they are reported as informational only.
 */
import {
  CENTRAL_SCHEMA,
  type CentralColumnSpec,
  type CentralTableSchema,
} from "./central-schema";

export type DeepCategory =
  | "column"
  | "nullability"
  | "default"
  | "key"
  | "constraint"
  | "index"
  | "trigger"
  | "security"
  | "policy";

export const DEEP_CATEGORY_LABEL: Record<DeepCategory, string> = {
  column: "Missing columns",
  nullability: "Nullability",
  default: "Defaults",
  key: "Keys",
  constraint: "Constraints",
  index: "Indexes",
  trigger: "Triggers",
  security: "Row security",
  policy: "Policies",
};

/** One thing the database is missing, with the guarded statement that fixes it. */
export type DeepFinding = {
  table: string;
  category: DeepCategory;
  /** Human sentence for the panel. */
  detail: string;
  /** Idempotent, additive SQL. Never a drop. */
  statements: string[];
};

/** What the deep inventory reports for one table. */
export type InventoryTable = {
  columns: Record<string, { type?: string; nullable?: boolean; default?: string | null }>;
  constraints?: Record<string, { kind?: string; definition?: string }>;
  indexes?: string[];
  triggers?: string[];
  policies?: string[];
  rls?: boolean;
};

/** table (lowercase) → inventory. */
export type DeepInventory = Record<string, InventoryTable>;

type LegacyInventoryTable = {
  table?: string;
  rls?: boolean;
  policies?: number;
  indexes?: number;
  columns?: { name?: string; notnull?: boolean; has_default?: boolean }[];
  foreign_keys?: { name?: string; definition?: string }[];
};

/** Normalise the raw jsonb payload into lowercase keys. */
export function inventoryFromPayload(payload: unknown): DeepInventory {
  const out: DeepInventory = {};
  if (!payload || typeof payload !== "object") return out;
  for (const [table, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const columns: InventoryTable["columns"] = {};
    for (const [col, meta] of Object.entries((t["columns"] as Record<string, unknown>) ?? {})) {
      const m = (meta ?? {}) as Record<string, unknown>;
      columns[col.toLowerCase()] = {
        type: typeof m["type"] === "string" ? m["type"] : undefined,
        nullable: m["nullable"] !== false,
        default: typeof m["default"] === "string" ? m["default"] : null,
      };
    }
    const constraints: NonNullable<InventoryTable["constraints"]> = {};
    for (const [name, meta] of Object.entries(
      (t["constraints"] as Record<string, unknown>) ?? {},
    )) {
      const m = (meta ?? {}) as Record<string, unknown>;
      constraints[name.toLowerCase()] = {
        kind: typeof m["kind"] === "string" ? m["kind"] : undefined,
        definition: typeof m["definition"] === "string" ? m["definition"] : undefined,
      };
    }
    const list = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : ([] as string[]);
    out[table.toLowerCase()] = {
      columns,
      constraints,
      indexes: list(t["indexes"]),
      triggers: list(t["triggers"]),
      policies: list(t["policies"]),
      rls: t["rls"] === true,
    };
  }
  return out;
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/** The bare type, without the "not null default …" tail. */
export function baseType(pgType: string): string {
  return pgType.split(/\s+not\s+null|\s+default\s+/i)[0]!.trim();
}

export function expectsNotNull(spec: CentralColumnSpec): boolean {
  return /\bnot\s+null\b/i.test(spec.pgType);
}

export function expectedDefault(spec: CentralColumnSpec): string | null {
  const m = /\bdefault\s+(.+)$/i.exec(spec.pgType);
  return m ? m[1]!.trim() : null;
}

/** Loose equality for a default expression across PostgreSQL's re-printing. */
function sameDefault(expected: string, found: string | null | undefined): boolean {
  if (!found) return false;
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/::[a-z0-9_ ]+(\[\])?/g, "")
      .replace(/[()\s]/g, "");
  return norm(found).startsWith(norm(expected));
}

/**
 * Compare the authoritative definition against a deep inventory. Tables the
 * inventory does not know about are skipped here — the shallow check already
 * reports a missing table, and a table has to exist before its keys,
 * constraints and policies mean anything.
 */
export function computeDeepDrift(
  inventory: DeepInventory,
  schema: CentralTableSchema[] = CENTRAL_SCHEMA,
): DeepFinding[] {
  const findings: DeepFinding[] = [];
  for (const spec of schema) {
    const actual = inventory[spec.table.toLowerCase()];
    if (!actual) continue;
    const table = `public.${q(spec.table)}`;

    for (const col of spec.columns) {
      const found = actual.columns[col.name.toLowerCase()];
      if (!found) continue; // shallow check owns missing columns
      if (expectsNotNull(col) && found.nullable) {
        findings.push({
          table: spec.table,
          category: "nullability",
          detail: `${col.name} should never be empty`,
          statements: [
            `-- Only runs when no existing row would break; review before running.`,
            `alter table ${table} alter column ${q(col.name)} set not null;`,
          ],
        });
      }
      const def = expectedDefault(col);
      if (def && !sameDefault(def, found.default)) {
        findings.push({
          table: spec.table,
          category: "default",
          detail: `${col.name} is missing its default (${def})`,
          statements: [`alter table ${table} alter column ${q(col.name)} set default ${def};`],
        });
      }
    }

    // Primary key.
    const constraints = actual.constraints ?? {};
    const hasPk = Object.values(constraints).some((c) => c.kind === "p");
    if (spec.primaryKey && !hasPk) {
      findings.push({
        table: spec.table,
        category: "key",
        detail: `no primary key (expected ${spec.primaryKey})`,
        statements: [
          `do $$ begin`,
          `  if not exists (select 1 from pg_constraint where conrelid = 'public.${spec.table}'::regclass and contype = 'p') then`,
          `    alter table ${table} add primary key (${q(spec.primaryKey)});`,
          `  end if;`,
          `end $$;`,
        ],
      });
    }

    // Declared constraints (unique / check / foreign key).
    for (const c of spec.constraints ?? []) {
      if (constraints[c.name.toLowerCase()]) continue;
      findings.push({
        table: spec.table,
        category: "constraint",
        detail: `constraint ${c.name} is missing`,
        statements: [
          `do $$ begin`,
          `  if not exists (select 1 from pg_constraint where conname = '${c.name}') then`,
          `    alter table ${table} add constraint ${q(c.name)} ${c.definition};`,
          `  end if;`,
          `end $$;`,
        ],
      });
    }

    // Indexes expected at all times.
    const indexes = new Set(actual.indexes ?? []);
    for (const idx of spec.indexes ?? []) {
      if (!idx.always) continue;
      if (indexes.has(idx.name.toLowerCase())) continue;
      findings.push({
        table: spec.table,
        category: "index",
        detail: `index ${idx.name} is missing`,
        statements: [idx.sql],
      });
    }

    // Triggers.
    const triggers = new Set(actual.triggers ?? []);
    for (const trg of spec.triggers ?? []) {
      if (triggers.has(trg.name.toLowerCase())) continue;
      findings.push({
        table: spec.table,
        category: "trigger",
        detail: `trigger ${trg.name} is missing`,
        statements: [trg.sql],
      });
    }

    // Row security and policies.
    if (spec.rowSecurity !== false && actual.rls !== true) {
      findings.push({
        table: spec.table,
        category: "security",
        detail: "row-level security is switched off",
        statements: [`alter table ${table} enable row level security;`],
      });
    }
    const policies = new Set(actual.policies ?? []);
    for (const pol of spec.policies ?? []) {
      if (policies.has(pol.name.toLowerCase())) continue;
      findings.push({
        table: spec.table,
        category: "policy",
        detail: `policy "${pol.name}" is missing`,
        statements: [
          `do $$ begin`,
          `  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = '${spec.table}' and policyname = '${pol.name}') then`,
          `    ${pol.sql.replace(/;\s*$/, "")};`,
          `  end if;`,
          `end $$;`,
        ],
      });
    }
    if (spec.rowSecurity !== false && (actual.policies ?? []).length === 0) {
      findings.push({
        table: spec.table,
        category: "policy",
        detail: "no access policy at all — the table is unreachable through the API",
        statements: [
          `-- No policy is generated automatically: who may read or write this`,
          `-- table is a business decision. Add it in the central project.`,
        ],
      });
    }
  }
  return findings;
}

/** Compare only facts the previous `schema_inventory()` response can prove. */
export function computeLegacyDeepDrift(
  payload: unknown,
  schema: CentralTableSchema[] = CENTRAL_SCHEMA,
): DeepFinding[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { tables?: unknown }).tables;
  if (!Array.isArray(rows)) return [];
  const actual = new Map<string, LegacyInventoryTable>();
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as LegacyInventoryTable;
    if (typeof row.table === "string") actual.set(row.table.toLowerCase(), row);
  }

  const findings: DeepFinding[] = [];
  for (const spec of schema) {
    const row = actual.get(spec.table.toLowerCase());
    if (!row) continue;
    const table = `public.${q(spec.table)}`;
    const columns = new Map(
      (Array.isArray(row.columns) ? row.columns : [])
        .filter((column) => typeof column.name === "string")
        .map((column) => [String(column.name).toLowerCase(), column]),
    );
    for (const column of spec.columns) {
      const found = columns.get(column.name.toLowerCase());
      if (!found) continue;
      if (expectsNotNull(column) && found.notnull !== true) {
        findings.push({
          table: spec.table,
          category: "nullability",
          detail: `${column.name} should never be empty`,
          statements: [`alter table ${table} alter column ${q(column.name)} set not null;`],
        });
      }
      const expected = expectedDefault(column);
      if (expected && found.has_default !== true) {
        findings.push({
          table: spec.table,
          category: "default",
          detail: `${column.name} is missing its default (${expected})`,
          statements: [`alter table ${table} alter column ${q(column.name)} set default ${expected};`],
        });
      }
    }
    if (spec.rowSecurity !== false && row.rls !== true) {
      findings.push({
        table: spec.table,
        category: "security",
        detail: "row-level security is switched off",
        statements: [`alter table ${table} enable row level security;`],
      });
    }
    if (spec.rowSecurity !== false && row.policies === 0) {
      findings.push({
        table: spec.table,
        category: "policy",
        detail: "no access policy at all — the table is unreachable through the API",
        statements: ["-- Add an access policy appropriate to this table's business rules."],
      });
    }
    if (row.indexes === 0) {
      for (const index of spec.indexes ?? []) {
        if (!index.always) continue;
        findings.push({
          table: spec.table,
          category: "index",
          detail: `index ${index.name} is missing`,
          statements: [index.sql],
        });
      }
    }
    const foreignKeys = new Set(
      (Array.isArray(row.foreign_keys) ? row.foreign_keys : []).map((key) =>
        String(key.name ?? "").toLowerCase(),
      ),
    );
    for (const constraint of spec.constraints ?? []) {
      if (!/^foreign\s+key/i.test(constraint.definition) || foreignKeys.has(constraint.name.toLowerCase())) {
        continue;
      }
      findings.push({
        table: spec.table,
        category: "constraint",
        detail: `foreign key ${constraint.name} is missing`,
        statements: [`alter table ${table} add constraint ${q(constraint.name)} ${constraint.definition};`],
      });
    }
  }
  return findings;
}

/** Column list with real types, for the repair file. */
export function columnTypes(spec: CentralTableSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of spec.columns) out[c.name] = baseType(c.pgType);
  return out;
}
