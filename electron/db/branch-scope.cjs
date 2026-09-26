/**
 * Build the SQL Server equivalent of the branch predicates generated for the
 * Supabase synchronization RPCs. Registry names are trusted build artifacts;
 * branch and cutoff values are always bound parameters.
 */
function columnNames(table) {
  return new Set((table?.columns ?? []).map((column) => column.sqlServerColumn));
}

function branchPredicate(registry, table, alias = "source", seen = new Set()) {
  if (!table || seen.has(table.sqlServerTable)) return null;
  const nextSeen = new Set(seen).add(table.sqlServerTable);
  const names = columnNames(table);
  if (names.has("store_id")) return `${alias}.[store_id]=@branch`;
  if (names.has("branch_id")) return `${alias}.[branch_id]=@branch`;
  if (names.has("from_store_id") && names.has("to_store_id"))
    return `(${alias}.[from_store_id]=@branch OR ${alias}.[to_store_id]=@branch)`;
  for (const column of table.columns ?? []) {
    if (!column.foreignKey || !column.foreignKeyTarget) continue;
    const parent = (registry.tables ?? []).find((candidate) =>
      candidate.cloudTable === column.foreignKeyTarget.table ||
      candidate.sqlServerTable === column.foreignKeyTarget.table);
    if (!parent) continue;
    const parentFilter = branchPredicate(registry, parent, "parent", nextSeen);
    if (!parentFilter) continue;
    const parentColumn = parent.columns.find((candidate) => candidate.cloudColumn === column.foreignKeyTarget.column);
    const parentKey = parentColumn?.sqlServerColumn ?? column.foreignKeyTarget.column;
    return `EXISTS (SELECT 1 FROM dbo.[${parent.sqlServerTable}] parent WHERE parent.[${parentKey}]=${alias}.[${column.sqlServerColumn}] AND ${parentFilter})`;
  }
  return null;
}

function dateColumn(table) {
  const names = columnNames(table);
  return ["created_at", "paid_at", "occurred_at", "updated_at"].find((name) => names.has(name)) ?? null;
}

function scopedWhere(registry, table, { historyDays = 90, alias = "source" } = {}) {
  const clauses = [];
  const branch = branchPredicate(registry, table, alias);
  if (branch) clauses.push(branch);
  const date = table?.retentionClass === "historical" ? dateColumn(table) : null;
  if (date && Number(historyDays) < 7300) clauses.push(`${alias}.[${date}]>=@cutoff`);
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

module.exports = { branchPredicate, dateColumn, scopedWhere };
