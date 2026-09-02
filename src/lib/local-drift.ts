/**
 * Deep comparison for the local Microsoft SQL Server database.
 *
 * The master file (`database/schema.sql`, returned by the bridge alongside the
 * table manifest) is the definition; the bridge's read-only inventory is the
 * reality. Row-level security and policies do not exist on SQL Server, so the
 * comparison covers nullability, defaults, primary keys and indexes.
 *
 * Everything emitted is guarded and additive — no drop, no rewrite.
 */
export type LocalInventoryTable = {
  columns: Record<string, { type?: string | null; nullable?: boolean; default?: string | null }>;
  primaryKey?: string[];
  foreignKeys?: string[];
  constraints?: string[];
  indexes?: string[];
  triggers?: string[];
};

export type LocalInventory = Record<string, LocalInventoryTable>;

export type LocalExpectation = {
  table: string;
  columns: { name: string; type: string; notNull: boolean; default: string | null }[];
  hasPrimaryKey: boolean;
  indexes: { name: string; sql: string }[];
};

const tsql = (name: string) => `[${name.replace(/]/g, "]]")}]`;

/** Parse the master T-SQL file into per-table expectations. */
export function parseLocalExpectations(text: string): LocalExpectation[] {
  const out: LocalExpectation[] = [];
  const tableRe = /CREATE\s+TABLE\s+(?:dbo\.)?\[?(\w+)\]?\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(text))) {
    const table = m[1]!;
    const body = m[2]!;
    const columns: LocalExpectation["columns"] = [];
    let hasPrimaryKey = /primary\s+key/i.test(body);
    for (const raw of splitTopLevel(body)) {
      const line = raw.trim().replace(/,$/, "");
      if (!line || /^(constraint|primary\s+key|unique|foreign\s+key|check)\b/i.test(line)) continue;
      const col = /^\[?(\w+)\]?\s+([A-Za-z0-9_]+(?:\s*\([^)]*\))?)([\s\S]*)$/.exec(line);
      if (!col) continue;
      const tail = col[3] ?? "";
      if (/primary\s+key/i.test(tail)) hasPrimaryKey = true;
      const def = /\bdefault\s+(\(.*?\)|'[^']*'|[^\s,]+)/i.exec(tail);
      columns.push({
        name: col[1]!,
        type: col[2]!.replace(/\s+/g, ""),
        notNull: /\bnot\s+null\b/i.test(tail),
        default: def ? def[1]!.trim() : null,
      });
    }
    out.push({ table, columns, hasPrimaryKey, indexes: [] });
  }

  const idxRe =
    /CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+|CLUSTERED\s+)?INDEX\s+\[?(\w+)\]?\s+ON\s+(?:dbo\.)?\[?(\w+)\]?[^;]*;/gi;
  while ((m = idxRe.exec(text))) {
    const spec = out.find((t) => t.table.toLowerCase() === m![2]!.toLowerCase());
    if (spec) spec.indexes.push({ name: m[1]!, sql: m[0]!.trim() });
  }
  return out;
}

/** Split a CREATE TABLE body on commas that are not inside brackets. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export type LocalFinding = {
  table: string;
  category: "nullability" | "default" | "key" | "index";
  detail: string;
  statements: string[];
};

const sameDefault = (expected: string, found: string | null | undefined) => {
  if (!found) return false;
  const norm = (v: string) => v.toLowerCase().replace(/[()\s]/g, "");
  return norm(found).includes(norm(expected));
};

export function computeLocalDeepDrift(
  expectations: LocalExpectation[],
  inventory: LocalInventory,
): LocalFinding[] {
  const findings: LocalFinding[] = [];
  for (const spec of expectations) {
    const actual = inventory[spec.table.toLowerCase()];
    if (!actual) continue; // the shallow check owns missing tables
    for (const col of spec.columns) {
      const found = actual.columns[col.name.toLowerCase()];
      if (!found) continue; // shallow check owns missing columns
      if (col.notNull && found.nullable !== false) {
        findings.push({
          table: spec.table,
          category: "nullability",
          detail: `${col.name} should never be empty`,
          statements: [
            `-- Review first: this only succeeds when no existing row is empty.`,
            `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.${spec.table}') AND name = '${col.name}' AND is_nullable = 1)`,
            `  ALTER TABLE dbo.${tsql(spec.table)} ALTER COLUMN ${tsql(col.name)} ${col.type} NOT NULL;`,
          ],
        });
      }
      if (col.default && !sameDefault(col.default, found.default)) {
        findings.push({
          table: spec.table,
          category: "default",
          detail: `${col.name} is missing its default (${col.default})`,
          statements: [
            `IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id WHERE dc.parent_object_id = OBJECT_ID('dbo.${spec.table}') AND c.name = '${col.name}')`,
            `  ALTER TABLE dbo.${tsql(spec.table)} ADD CONSTRAINT ${tsql(`DF_${spec.table}_${col.name}`)} DEFAULT ${col.default} FOR ${tsql(col.name)};`,
          ],
        });
      }
    }
    if (spec.hasPrimaryKey && !(actual.primaryKey ?? []).length) {
      findings.push({
        table: spec.table,
        category: "key",
        detail: "no primary key",
        statements: [
          `-- The master file declares a primary key for dbo.${spec.table} but the`,
          `-- database has none. Repair the table from the Schema manager, which`,
          `-- owns the full guarded definition.`,
        ],
      });
    }
    const have = new Set(actual.indexes ?? []);
    for (const idx of spec.indexes) {
      if (have.has(idx.name.toLowerCase())) continue;
      findings.push({
        table: spec.table,
        category: "index",
        detail: `index ${idx.name} is missing`,
        statements: [
          `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${idx.name}' AND object_id = OBJECT_ID('dbo.${spec.table}'))`,
          `  ${idx.sql}`,
        ],
      });
    }
  }
  return findings;
}
