const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(root, "reports", "supabase-schema-registry-report.json"), "utf8"));
const outputDir = path.join(root, "database", "sqlserver");
const PRIMARY_KEYS = Object.freeze({
  branch_telemetry: ["terminal_id"], pin_attempts: ["key"], public_flags: ["key"], secure_settings: ["key"],
  settings_locks: ["section"], settings_overrides: ["scope","scope_id","section"], staff_roles: ["slug"],
  stock_delta_applied: ["movement_id"], terminal_recovery_secrets: ["terminal_token_id"], pos_store_settings: ["store_id"],
  settings_scoped: ["scope","scope_id","key"],
});
const PULL_ONLY = new Set(["app_users","cashiers","staff_roles","user_roles","authorization_actions","secure_settings","settings_locks","public_flags","terminal_tokens","terminal_recovery_secrets","security_findings"]);

function sqlType(declaration) {
  const d = declaration.toLowerCase();
  const sized = (name, fallback) => new RegExp(`${name}\\s*\\(([^)]+)\\)`).exec(d)?.[1] ?? fallback;
  if (/^uuid\b/.test(d)) return "uniqueidentifier";
  if (/^bigint\b|^bigserial\b/.test(d)) return "bigint";
  if (/^integer\b|^serial\b/.test(d)) return "int";
  if (/^smallint\b/.test(d)) return "smallint";
  if (/^(?:numeric|decimal)\b/.test(d)) return `decimal(${sized("(?:numeric|decimal)", "38,12")})`;
  if (/^(?:double precision|real)\b/.test(d)) return "float";
  if (/^boolean\b/.test(d)) return "bit";
  if (/^timestamp with time zone\b/.test(d)) return "datetimeoffset(7)";
  if (/^timestamp without time zone\b|^timestamp\b/.test(d)) return "datetime2(7)";
  if (/^date\b/.test(d)) return "date";
  if (/^time\b/.test(d)) return "time(7)";
  if (/^bytea\b/.test(d)) return "varbinary(max)";
  if (/^character varying\b|^varchar\b/.test(d)) return `nvarchar(${sized("(?:character varying|varchar)", "max")})`;
  if (/^character\b|^char\b/.test(d)) return `nchar(${sized("(?:character|char)", "1")})`;
  return "nvarchar(max)";
}

function defaultRule(declaration, type) {
  const found = /\bDEFAULT\s+(.+?)(?=\s+NOT NULL\b|\s+NULL\b|$)/i.exec(declaration)?.[1]?.trim();
  if (!found) return null;
  const clean = found.replace(/::[a-z ]+(?:\[\])?/gi, "").replace(/^\((.*)\)$/s, "$1");
  if (/^gen_random_uuid\(\)$/i.test(clean)) return "NEWID()";
  if (/^(?:now\(\)|CURRENT_TIMESTAMP)$/i.test(clean)) return type.startsWith("datetimeoffset") ? "SYSDATETIMEOFFSET()" : "SYSUTCDATETIME()";
  if (/^true$/i.test(clean)) return "1";
  if (/^false$/i.test(clean)) return "0";
  if (/^nextval\(/i.test(clean)) return null;
  if (/^ARRAY\[/i.test(clean) || /^'\{/.test(clean)) return "N'[]'";
  if (/^-?\d+(?:\.\d+)?$/.test(clean) || /^N?'[^']*'$/.test(clean)) return clean;
  return null;
}

const tables = report.tables.map((table, tableIndex) => ({
  cloudTable: table.name,
  sqlServerTable: table.name,
  scope: /^(?:stores|store_groups|coupon_campaigns|payment_types|staff_roles)$/.test(table.name) ? "organization" : "branch",
  direction: PULL_ONLY.has(table.name) ? "pull" : "bidirectional",
  retentionClass: /^(?:sales|sale_items|payment_transactions|refunds|audit_logs|item_activity_logs)/.test(table.name) ? "historical" : "current",
  insertRule: "idempotent_upsert",
  updateRule: "versioned",
  deleteRule: "tombstone",
  conflictRule: /^(?:sales|sale_items|payment_transactions|refunds)/.test(table.name)
    ? "immutable_reversal"
    : /^(?:item_activity_logs|stock_adjustments|stock_delta_applied)$/.test(table.name)
      ? "movement_delta"
      : "highest_version",
  dependencyOrder: tableIndex,
  testName: `registry_${table.name}`,
  columns: table.columns.map((column) => {
    let type = sqlType(column.declaration);
    const primaryNames = table.primaryKey?.length ? table.primaryKey : (PRIMARY_KEYS[table.name] ?? ["id"]);
    const primary = primaryNames.includes(column.name);
    const uniqueGroup=(table.uniqueKeys??[]).findIndex(key=>key.includes(column.name));
    const unique = /\bUNIQUE\b/i.test(column.declaration) || (uniqueGroup>=0&&(table.uniqueKeys[uniqueGroup]?.length===1));
    if ((primary || unique) && type === "nvarchar(max)") type = "nvarchar(450)";
    const reference = /\bREFERENCES\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/i.exec(column.declaration);
    const tableReference=table.foreignKeys?.find(item=>item.column===column.name);
    return {
      cloudColumn: column.name,
      sqlServerColumn: column.name,
      cloudType: column.declaration.split(/\s+(?:DEFAULT|NOT|NULL|CONSTRAINT|PRIMARY|REFERENCES|CHECK)\b/i)[0].trim(),
      sqlServerType: type,
      nullable: column.nullable,
      defaultRule: defaultRule(column.declaration, type),
      primaryKey: primary,
      foreignKey: Boolean(reference||tableReference),
      foreignKeyTarget: reference ? { table: reference[1], column: reference[2].replace(/['"\s]/g,"") } : tableReference ? {table:tableReference.table,column:tableReference.targetColumn}:null,
      unique,
      uniqueGroup: uniqueGroup>=0?`UQ_${table.name}_${uniqueGroup}`:null,
    };
  }),
}));

const tableByName = new Map(tables.map((table) => [table.cloudTable, table]));
function dependencyDepth(table, visiting = new Set()) {
  if (visiting.has(table.cloudTable)) return 0;
  const next = new Set(visiting).add(table.cloudTable);
  const parents = table.columns.map((column) => column.foreignKeyTarget?.table).filter((name) => name && name !== table.cloudTable && tableByName.has(name));
  return parents.length ? 1 + Math.max(...parents.map((name) => dependencyDepth(tableByName.get(name), next))) : 0;
}
for (const table of tables) table.dependencyOrder = dependencyDepth(table);

const registry = { version: 1, source: "supabase/schema.sql", generatedAt: report.generatedAt, tables };
const lines = [
  "-- Generated from supabase/schema.sql. Re-runnable and additive.",
  "SET XACT_ABORT ON;",
  "IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id=DB_ID()) ALTER DATABASE CURRENT SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);",
  "GO",
];
for (const table of tables) {
  lines.push(`IF OBJECT_ID(N'dbo.${table.sqlServerTable}', N'U') IS NULL BEGIN CREATE TABLE dbo.[${table.sqlServerTable}] (`);
  const columns = table.columns.map((column) => {
    const fallbackDefault = column.defaultRule ? ` CONSTRAINT [DF_${table.sqlServerTable}_${column.sqlServerColumn}] DEFAULT (${column.defaultRule})` : "";
    return `  [${column.sqlServerColumn}] ${column.sqlServerType}${column.nullable ? " NULL" : " NOT NULL"}${fallbackDefault}`;
  });
  const primary = table.columns.filter((column) => column.primaryKey).map((column) => `[${column.sqlServerColumn}]`);
  if (primary.length) columns.push(`  CONSTRAINT [PK_${table.sqlServerTable}] PRIMARY KEY (${primary.join(", ")})`);
  lines.push(columns.join(",\n"), "); END;", `IF OBJECT_ID(N'dbo.${table.sqlServerTable}', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.${table.sqlServerTable}')) ALTER TABLE dbo.[${table.sqlServerTable}] ENABLE CHANGE_TRACKING;`);
  for (const column of table.columns) {
    lines.push(`IF COL_LENGTH(N'dbo.${table.sqlServerTable}', N'${column.sqlServerColumn}') IS NULL ALTER TABLE dbo.[${table.sqlServerTable}] ADD [${column.sqlServerColumn}] ${column.sqlServerType} NULL;`);
  }
  for (const column of table.columns.filter((item)=>item.unique)) {
    lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.${table.sqlServerTable}') AND name=N'UX_${table.sqlServerTable}_${column.sqlServerColumn}') CREATE UNIQUE INDEX [UX_${table.sqlServerTable}_${column.sqlServerColumn}] ON dbo.[${table.sqlServerTable}]([${column.sqlServerColumn}]);`);
  }
  for(const [index,key] of (report.tables.find(item=>item.name===table.cloudTable)?.uniqueKeys??[]).entries()){
    if(key.length<2)continue;
    lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.${table.sqlServerTable}') AND name=N'UQ_${table.sqlServerTable}_${index}') CREATE UNIQUE INDEX [UQ_${table.sqlServerTable}_${index}] ON dbo.[${table.sqlServerTable}](${key.map(name=>`[${name}]`).join(",")});`);
  }
  for (const column of table.columns.filter((item)=>["store_id","branch_id","organization_id","updated_at"].includes(item.sqlServerColumn))) {
    lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.${table.sqlServerTable}') AND name=N'IX_${table.sqlServerTable}_${column.sqlServerColumn}') CREATE INDEX [IX_${table.sqlServerTable}_${column.sqlServerColumn}] ON dbo.[${table.sqlServerTable}]([${column.sqlServerColumn}]);`);
  }
}
for (const table of tables) {
  for (const column of table.columns.filter((item)=>item.foreignKey&&item.foreignKeyTarget)) {
    const target=column.foreignKeyTarget;
    lines.push(`IF OBJECT_ID(N'dbo.${target.table}',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.${table.sqlServerTable}') AND name=N'FK_${table.sqlServerTable}_${column.sqlServerColumn}') ALTER TABLE dbo.[${table.sqlServerTable}] ADD CONSTRAINT [FK_${table.sqlServerTable}_${column.sqlServerColumn}] FOREIGN KEY ([${column.sqlServerColumn}]) REFERENCES dbo.[${target.table}]([${target.column}]);`);
  }
}

lines.push(`IF OBJECT_ID(N'dbo.pos_jobs', N'U') IS NULL CREATE TABLE dbo.pos_jobs (
 job_id uniqueidentifier NOT NULL PRIMARY KEY, job_type nvarchar(40) NOT NULL, status nvarchar(20) NOT NULL,
 organization_id nvarchar(128) NULL, organization_name nvarchar(256) NULL, branch_id nvarchar(128) NULL,
 branch_name nvarchar(256) NULL, branch_code nvarchar(64) NULL, terminal_id nvarchar(128) NULL,
 terminal_name nvarchar(256) NULL, phase nvarchar(40) NULL, current_table nvarchar(128) NULL,
 dependency_index int NOT NULL DEFAULT 0, last_committed_cursor nvarchar(512) NULL,
 completed_rows bigint NOT NULL DEFAULT 0, estimated_total_rows bigint NULL, completed_bytes bigint NOT NULL DEFAULT 0,
 batch_number int NOT NULL DEFAULT 0, batch_size int NOT NULL DEFAULT 500, retry_count int NOT NULL DEFAULT 0,
 next_retry_at datetimeoffset(7) NULL, started_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 updated_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(), finished_at datetimeoffset(7) NULL,
 error_code nvarchar(64) NULL, error_message nvarchar(1000) NULL);`);
lines.push(`IF OBJECT_ID(N'dbo.sync_checkpoints', N'U') IS NULL CREATE TABLE dbo.sync_checkpoints (
 organization_id nvarchar(128) NOT NULL, branch_id nvarchar(128) NOT NULL, entity_type nvarchar(128) NOT NULL,
 direction nvarchar(8) NOT NULL, committed_cursor nvarchar(512) NULL, change_tracking_version bigint NULL,
 acknowledged_at datetimeoffset(7) NULL, updated_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 CONSTRAINT PK_sync_checkpoints PRIMARY KEY (organization_id,branch_id,entity_type,direction));`);
lines.push(`IF OBJECT_ID(N'dbo.sync_change_journal', N'U') IS NULL CREATE TABLE dbo.sync_change_journal (
 change_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, entity_type nvarchar(128) NOT NULL,
 entity_id nvarchar(128) NOT NULL, operation nvarchar(10) NOT NULL, branch_id nvarchar(128) NOT NULL,
 entity_version bigint NOT NULL, aggregate_id uniqueidentifier NULL, acknowledged_at datetimeoffset(7) NULL,
 retry_count int NOT NULL DEFAULT 0, last_error nvarchar(1000) NULL,
 created_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 CONSTRAINT CK_sync_change_journal_metadata_only CHECK (operation IN ('insert','update','delete')));`);
lines.push(`IF COL_LENGTH(N'dbo.sync_change_journal',N'aggregate_id') IS NULL ALTER TABLE dbo.sync_change_journal ADD aggregate_id uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.sync_change_journal',N'acknowledged_at') IS NULL ALTER TABLE dbo.sync_change_journal ADD acknowledged_at datetimeoffset(7) NULL;
IF COL_LENGTH(N'dbo.sync_change_journal',N'retry_count') IS NULL ALTER TABLE dbo.sync_change_journal ADD retry_count int NOT NULL CONSTRAINT DF_sync_change_journal_retry_count DEFAULT 0;
IF COL_LENGTH(N'dbo.sync_change_journal',N'last_error') IS NULL ALTER TABLE dbo.sync_change_journal ADD last_error nvarchar(1000) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sync_change_journal') AND name=N'IX_sync_change_journal_pending') CREATE INDEX IX_sync_change_journal_pending ON dbo.sync_change_journal(branch_id,acknowledged_at,aggregate_id,change_id);`);
lines.push(`IF OBJECT_ID(N'dbo.sync_conflicts', N'U') IS NULL CREATE TABLE dbo.sync_conflicts (
 conflict_id uniqueidentifier NOT NULL PRIMARY KEY, entity_type nvarchar(128) NOT NULL, entity_id nvarchar(128) NOT NULL,
 branch_id nvarchar(128) NOT NULL, local_version bigint NULL, remote_version bigint NULL, reason nvarchar(1000) NOT NULL,
 status nvarchar(20) NOT NULL DEFAULT 'unresolved', created_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(), resolved_at datetimeoffset(7) NULL);`);
lines.push(`IF OBJECT_ID(N'dbo.local_operation_receipts', N'U') IS NULL CREATE TABLE dbo.local_operation_receipts (
 operation_id uniqueidentifier NOT NULL PRIMARY KEY, operation_type nvarchar(40) NOT NULL, entity_id nvarchar(128) NOT NULL,
 note nvarchar(400) NULL, committed_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET());`);
lines.push(`IF OBJECT_ID(N'dbo.pos_schema_migrations', N'U') IS NULL CREATE TABLE dbo.pos_schema_migrations (
 version int NOT NULL PRIMARY KEY, name nvarchar(200) NOT NULL, applied_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET());
IF NOT EXISTS(SELECT 1 FROM dbo.pos_schema_migrations WHERE version=1) INSERT dbo.pos_schema_migrations(version,name) VALUES(1,N'initial_sqlserver_parity');`);

fs.mkdirSync(path.join(outputDir, "migrations"), { recursive: true });
fs.writeFileSync(path.join(outputDir, "schema-registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "schema.sql"), `${lines.join("\n\n")}\n`);
fs.writeFileSync(path.join(outputDir, "migrations", "001_initial.sql"), `${lines.join("\n\n")}\n`);
console.log(`SQL Server schema: ${tables.length} domain tables, ${tables.reduce((n,t)=>n+t.columns.length,0)} columns`);
