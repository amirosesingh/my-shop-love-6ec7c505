/**
 * Table helpers: turn the app's serialisable sync operations into parameterised
 * T-SQL, and expose the queries the sync worker needs.
 */
const { sql, getPool } = require("./pool");

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/** Tables in dependency order — parents push before their children. */
const TABLES = [
  "membership_tiers",
  "products",
  "members",
  "promotions",
  "pos_settings",
  "shifts",
  "sales",
  "sale_items",
  "purchase_orders",
  "purchase_order_items",
  "bookings",
  "booking_payments",
  "transfers",
  "audit_logs",
];

/** Cloud is authoritative for these; they are the only tables ever pulled. */
const CATALOGUE_TABLES = ["membership_tiers", "products", "promotions"];

const SYNC_COLUMNS = new Set(["is_synced", "sync_status"]);

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function assertTable(table) {
  if (!TABLES.includes(table)) throw new Error(`Unknown table: ${table}`);
  return table;
}

/** Picks a driver type so values bind safely instead of being interpolated. */
function bind(request, name, value) {
  if (value === null || value === undefined) return request.input(name, sql.NVarChar, null);
  if (typeof value === "boolean") return request.input(name, sql.Bit, value);
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? request.input(name, sql.Int, value)
      : request.input(name, sql.Decimal(18, 4), value);
  }
  if (value instanceof Date) return request.input(name, sql.DateTime2, value);
  if (typeof value === "object") {
    return request.input(name, sql.NVarChar(sql.MAX), JSON.stringify(value));
  }
  if (isUuid(value)) return request.input(name, sql.UniqueIdentifier, value);
  return request.input(name, sql.NVarChar(sql.MAX), value);
}

/** pos_settings is one wide row in the cloud; locally it is stored as JSON. */
function normaliseRow(table, row) {
  if (table !== "pos_settings") return row;
  const { id: _id, ...payload } = row;
  return { id: SETTINGS_ID, payload };
}

async function upsertRow(tx, table, row, { markPending = true } = {}) {
  assertTable(table);
  const record = normaliseRow(table, row);
  const columns = Object.keys(record).filter((c) => !SYNC_COLUMNS.has(c));
  if (!columns.includes("id")) columns.unshift("id");

  const request = new sql.Request(tx);
  for (const col of columns) bind(request, col, record[col] ?? null);

  const setList = columns
    .filter((c) => c !== "id")
    .map((c) => `t.[${c}] = s.[${c}]`)
    .concat("t.[updated_at] = SYSUTCDATETIME()")
    .concat(markPending ? ["t.[is_synced] = 0", "t.[sync_status] = N'pending'"] : [])
    .join(", ");

  const insertCols = columns.map((c) => `[${c}]`).join(", ");
  const insertVals = columns.map((c) => `s.[${c}]`).join(", ");
  const source = columns.map((c) => `@${c} AS [${c}]`).join(", ");

  await request.query(`
    MERGE dbo.[${table}] WITH (HOLDLOCK) AS t
    USING (SELECT ${source}) AS s ON t.[id] = s.[id]
    WHEN MATCHED THEN UPDATE SET ${setList}
    WHEN NOT MATCHED THEN INSERT (${insertCols}, [is_synced], [sync_status])
      VALUES (${insertVals}, ${markPending ? 0 : 1}, ${markPending ? "N'pending'" : "N'synced'"});
  `);
}

async function updateRows(tx, table, values, match) {
  assertTable(table);
  const request = new sql.Request(tx);
  const sets = [];
  for (const [key, value] of Object.entries(values)) {
    bind(request, `set_${key}`, value);
    sets.push(`[${key}] = @set_${key}`);
  }
  const wheres = [];
  for (const [key, value] of Object.entries(match)) {
    bind(request, `w_${key}`, value);
    wheres.push(`[${key}] = @w_${key}`);
  }
  await request.query(`
    UPDATE dbo.[${table}]
       SET ${sets.join(", ")}, [updated_at] = SYSUTCDATETIME(),
           [is_synced] = 0, [sync_status] = N'pending'
     WHERE ${wheres.join(" AND ")};
  `);
}

async function deleteRows(tx, table, match) {
  assertTable(table);
  const request = new sql.Request(tx);
  const wheres = [];
  for (const [key, value] of Object.entries(match)) {
    bind(request, `w_${key}`, value);
    wheres.push(`[${key}] = @w_${key}`);
  }
  await request.query(`DELETE FROM dbo.[${table}] WHERE ${wheres.join(" AND ")};`);
}

/**
 * Applies one operation from the app inside a single transaction, so a sale and
 * its lines either both land or neither does.
 */
async function applyOp(op) {
  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    if (op.kind === "insert" || op.kind === "upsert") {
      for (const row of op.rows ?? []) await upsertRow(tx, op.table, row);
    } else if (op.kind === "update") {
      await updateRows(tx, op.table, op.values ?? {}, op.match ?? {});
    } else if (op.kind === "delete") {
      await deleteRows(tx, op.table, op.match ?? {});
    } else {
      throw new Error(`Unsupported operation: ${op.kind}`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function pendingRows(table, limit = 200) {
  assertTable(table);
  const res = await getPool()
    .request()
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit) * FROM dbo.[${table}]
       WHERE is_synced = 0 AND sync_status <> N'quarantined'
       ORDER BY created_at ASC;
    `);
  return res.recordset;
}

async function markSynced(table, ids) {
  if (!ids.length) return;
  assertTable(table);
  const request = getPool().request();
  ids.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));
  await request.query(`
    UPDATE dbo.[${table}]
       SET is_synced = 1, sync_status = N'synced', updated_at = updated_at
     WHERE id IN (${ids.map((_, i) => `@id${i}`).join(", ")});
  `);
}

/** Repeated failures park the row so one bad record can't block the queue. */
async function markFailed(table, ids, message, quarantine) {
  if (!ids.length) return;
  assertTable(table);
  const request = getPool()
    .request()
    .input("status", sql.NVarChar(20), quarantine ? "quarantined" : "error")
    .input("msg", sql.NVarChar(sql.MAX), String(message).slice(0, 3000));
  ids.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));
  await request.query(`
    UPDATE dbo.[${table}]
       SET sync_status = @status
     WHERE id IN (${ids.map((_, i) => `@id${i}`).join(", ")});
    MERGE dbo.sync_state AS t
    USING (SELECT N'last_error' AS [key], @msg AS [value]) AS s ON t.[key] = s.[key]
    WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
  `);
}

async function retryErrored() {
  for (const table of TABLES) {
    await getPool()
      .request()
      .query(
        `UPDATE dbo.[${table}] SET sync_status = N'pending'
          WHERE is_synced = 0 AND sync_status IN (N'error', N'quarantined');`,
      );
  }
}

/** Cloud rows land through MERGE and are flagged as already synced. */
async function mergeFromCloud(table, rows) {
  if (!rows.length) return 0;
  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const row of rows) await upsertRow(tx, table, row, { markPending: false });
    await tx.commit();
    return rows.length;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function stats() {
  const out = [];
  for (const table of TABLES) {
    const res = await getPool().request().query(`
      SELECT
        SUM(CASE WHEN is_synced = 0 AND sync_status = N'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced,
        SUM(CASE WHEN sync_status IN (N'error', N'quarantined') THEN 1 ELSE 0 END) AS errored
      FROM dbo.[${table}];
    `);
    const r = res.recordset[0] ?? {};
    out.push({
      table,
      pending: r.pending ?? 0,
      synced: r.synced ?? 0,
      errored: r.errored ?? 0,
    });
  }
  return out;
}

async function getState(key) {
  const res = await getPool()
    .request()
    .input("key", sql.NVarChar(60), key)
    .query("SELECT [value] FROM dbo.sync_state WHERE [key] = @key;");
  return res.recordset[0]?.value ?? null;
}

async function setState(key, value) {
  await getPool()
    .request()
    .input("key", sql.NVarChar(60), key)
    .input("value", sql.NVarChar(400), value)
    .query(`
      MERGE dbo.sync_state AS t
      USING (SELECT @key AS [key], @value AS [value]) AS s ON t.[key] = s.[key]
      WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
    `);
}

/** Strips local-only bookkeeping before a row is sent to the cloud. */
function toCloudRow(table, row) {
  const { is_synced: _s, sync_status: _st, ...rest } = row;
  if (table === "pos_settings") {
    const payload = typeof rest.payload === "string" ? JSON.parse(rest.payload) : rest.payload;
    return { id: 1, ...payload };
  }
  return rest;
}

module.exports = {
  TABLES,
  CATALOGUE_TABLES,
  SETTINGS_ID,
  applyOp,
  createSale,
  getProducts,
  pendingSyncCount,
  pendingRows,
  markSynced,
  markFailed,
  retryErrored,
  mergeFromCloud,
  stats,
  getState,
  setState,
  toCloudRow,
};