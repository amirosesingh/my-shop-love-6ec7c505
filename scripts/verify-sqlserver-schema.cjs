const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(root, "reports", "supabase-schema-registry-report.json"), "utf8"));
const registry = JSON.parse(fs.readFileSync(path.join(root, "database", "sqlserver", "schema-registry.json"), "utf8"));
const errors = [];
const mapped = new Map(registry.tables.map((table) => [table.cloudTable, table]));
const schema=fs.readFileSync(path.join(root,"database","sqlserver","schema.sql"),"utf8");
if(mapped.size!==registry.tables.length)errors.push("Duplicate cloud table mapping");
for (const table of report.tables) {
  const target = mapped.get(table.name);
  if (!target) { errors.push(`Missing decision for ${table.name}`); continue; }
  for (const field of ["scope", "direction", "retentionClass", "insertRule", "updateRule", "deleteRule", "conflictRule", "dependencyOrder", "testName"]) if (target[field] === undefined || target[field] === "") errors.push(`${table.name}: missing ${field}`);
  const columns = new Map(target.columns.map((column) => [column.cloudColumn,column]));
  if(columns.size!==target.columns.length)errors.push(`${table.name}: duplicate column mapping`);
  for (const column of table.columns) {
    const mappedColumn=columns.get(column.name);if(!mappedColumn){errors.push(`${table.name}.${column.name}: missing mapping`);continue;}
    for(const field of ["sqlServerColumn","cloudType","sqlServerType","nullable","defaultRule","primaryKey","foreignKey","unique"]){if(mappedColumn[field]===undefined)errors.push(`${table.name}.${column.name}: missing ${field}`);}
    if(mappedColumn.foreignKey&&(!mappedColumn.foreignKeyTarget?.table||!mappedColumn.foreignKeyTarget?.column))errors.push(`${table.name}.${column.name}: missing foreign-key target`);
  }
  if(target.columns.length!==table.columns.length)errors.push(`${table.name}: registry has unexpected columns`);
  if(!schema.includes(`dbo.[${target.sqlServerTable}]`))errors.push(`${table.name}: missing T-SQL table`);
}
for(const table of registry.tables)if(!report.tables.some(source=>source.name===table.cloudTable))errors.push(`${table.cloudTable}: no Supabase table`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`SQL Server registry verified: ${report.tables.length} tables`);
