const { safeError } = require("./errors.cjs");
const { loadRegistry } = require("./schema-registry.cjs");

async function validateDatabase(manager, profile) {
  try {
    const registry = loadRegistry();
    return await manager.temporary(profile, profile.database, async (pool) => {
      const catalog = await pool.request().query(`SELECT t.name AS table_name, c.name AS column_name,
        ty.name AS data_type, c.max_length, c.precision, c.scale, c.is_nullable,
        dc.definition AS default_definition
        FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
        JOIN sys.columns c ON c.object_id=t.object_id
        JOIN sys.types ty ON ty.user_type_id=c.user_type_id
        LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id
        WHERE s.name='dbo' ORDER BY t.name,c.column_id;`);
      const actual = new Map();
      for (const row of catalog.recordset ?? []) {
        if (!actual.has(row.table_name)) actual.set(row.table_name, new Map());
        actual.get(row.table_name).set(row.column_name, row);
      }
      const keyRows = await pool.request().query(`SELECT t.name table_name,i.name index_name,i.is_primary_key,i.is_unique,c.name column_name,ic.key_ordinal
        FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.indexes i ON i.object_id=t.object_id AND (i.is_primary_key=1 OR i.is_unique=1)
        JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
        WHERE s.name='dbo' AND ic.key_ordinal>0;`);
      const foreignRows = await pool.request().query(`SELECT pt.name table_name,pc.name column_name,rt.name referenced_table,rc.name referenced_column
        FROM sys.foreign_key_columns fkc JOIN sys.tables pt ON pt.object_id=fkc.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
        JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id JOIN sys.tables rt ON rt.object_id=fkc.referenced_object_id
        JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id WHERE ps.name='dbo';`);
      const keys=keyRows.recordset??[], foreignKeys=foreignRows.recordset??[];
      const normalizeType=(row)=>{const name=String(row.data_type).toLowerCase();if(["nvarchar","varchar","varbinary"].includes(name))return `${name}(${row.max_length===-1?"max":name.startsWith("n")?row.max_length/2:row.max_length})`;if(["decimal","numeric"].includes(name))return `${name}(${row.precision},${row.scale})`;if(["datetime2","datetimeoffset","time"].includes(name))return `${name}(${row.scale})`;return name;};
      const details = [];
      for (const table of registry.tables ?? []) {
        const columns = actual.get(table.sqlServerTable ?? table.name);
        const tableName=table.sqlServerTable??table.name;
        const missingColumns = [], incompatible=[];
        for(const column of table.columns??[]){const name=column.sqlServerColumn??column.name;const found=columns?.get(name);if(!found){missingColumns.push(name);continue;}
          if(normalizeType(found)!==String(column.sqlServerType).toLowerCase())incompatible.push(`${name}:type`);
          if(Boolean(found.is_nullable)!==Boolean(column.nullable))incompatible.push(`${name}:nullability`);
          if(column.defaultRule&&!found.default_definition)incompatible.push(`${name}:default`);
          if(column.primaryKey&&!keys.some(key=>key.table_name===tableName&&key.column_name===name&&key.is_primary_key))incompatible.push(`${name}:primary-key`);
          if(column.unique&&!keys.some(key=>key.table_name===tableName&&key.column_name===name&&key.is_unique))incompatible.push(`${name}:unique`);
          if(column.foreignKey&&column.foreignKeyTarget&&!foreignKeys.some(key=>key.table_name===tableName&&key.column_name===name&&key.referenced_table===column.foreignKeyTarget.table&&key.referenced_column===column.foreignKeyTarget.column))incompatible.push(`${name}:foreign-key`);
        }
        details.push({ table: tableName, present: Boolean(columns), missingColumns, incompatible });
      }
      const missingTables = details.filter((row) => !row.present).map((row) => row.table);
      const incompatibleColumns = details.flatMap((row) => [...row.missingColumns.map((column) => `${row.table}.${column}:missing`),...row.incompatible.map((issue)=>`${row.table}.${issue}`)]);
      const changeTracking = await pool.request().query("SELECT is_auto_cleanup_on, retention_period, retention_period_units_desc FROM sys.change_tracking_databases WHERE database_id=DB_ID();");
      const transaction = pool.transaction();
      await transaction.begin();
      let writeTest = false;
      try {
        await transaction.request().query("CREATE TABLE #pos_write_probe (id uniqueidentifier NOT NULL PRIMARY KEY); INSERT INTO #pos_write_probe(id) VALUES (NEWID());");
        writeTest = true;
      } finally { await transaction.rollback(); }
      const ready = registry.tables?.length > 0 && missingTables.length === 0 && incompatibleColumns.length === 0 && writeTest && Boolean(changeTracking.recordset?.length);
      return { ok: true, ready, schemaVersion: registry.version, requiredTables: registry.tables?.length ?? 0,
        presentTables: (registry.tables?.length ?? 0) - missingTables.length, missingTables,
        columnsCompatible: incompatibleColumns.length === 0, incompatibleColumns, writeTest,
        changeTracking: Boolean(changeTracking.recordset?.length), details,
        status: ready ? "ready" : actual.size ? "migration_required" : "not_pos_database" };
    });
  } catch (error) { return { ...safeError(error), ready: false, status: "error" }; }
}

module.exports = { validateDatabase };
