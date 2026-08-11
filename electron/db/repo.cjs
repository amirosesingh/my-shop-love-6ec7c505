/**
 * Table helpers: turn the app's serialisable sync operations into parameterised
 * T-SQL, and expose the queries the sync worker needs.
 */
const { sql, getPool } = require("./pool.cjs");

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/** Tables in dependency order — parents push before their children. */
const TABLES = [
  "stores",
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
  "stock_transfers",
  "stock_transfer_items",
  "audit_logs",
];

/** Cloud is authoritative for these; they are the only tables ever pulled. */
const CATALOGUE_TABLES = ["stores", "membership_tiers", "products", "promotions"];

const SYNC_COLUMNS = new Set(["is_synced", "sync_status", "synced_at"]);

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function assertTable(table) {
  if (!TABLES.includes(table)) throw new Error(`Unknown table: ${table}`);
  return table;
}

/**
 * Which columns each local table really has. The cloud schema moves ahead of
 * an installed terminal, so a write carrying a newer column must drop it here
 * rather than fail the whole sale.
 */
const columnCache = new Map();

async function tableColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const res = await getPool()
    .request()
    .input("t", sql.NVarChar, table)
    .query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t;",
    );
  const set = new Set(res.recordset.map((r) => r.COLUMN_NAME.toLowerCase()));
  columnCache.set(table, set);
  return set;
}

/** Called after schema.sql runs so newly added columns become visible. */
function forgetColumnCache() {
  columnCache.clear();
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

const JSON_COLUMNS = {
  products: ["stock_by_store", "packs", "barcode_aliases"],
  promotions: ["tier_rates"],
  bookings: ["lines"],
  transfers: ["items"],
  audit_logs: ["details"],
};

function parseJsonColumns(table, row) {
  const copy = { ...row };
  for (const column of JSON_COLUMNS[table] ?? []) {
    if (typeof copy[column] !== "string") continue;
    try { copy[column] = JSON.parse(copy[column]); } catch { /* preserve invalid legacy text */ }
  }
  return copy;
}

async function upsertRow(tx, table, row, { markPending = true } = {}) {
  assertTable(table);
  const record = normaliseRow(table, row);
  const known = await tableColumns(table);
  const columns = Object.keys(record).filter(
    (c) => !SYNC_COLUMNS.has(c) && known.has(c.toLowerCase()),
  );
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
    WHEN MATCHED ${markPending ? "" : "AND t.[is_synced] = 1 "}THEN UPDATE SET ${setList}
    WHEN NOT MATCHED THEN INSERT (${insertCols}, [is_synced], [sync_status])
      VALUES (${insertVals}, ${markPending ? 0 : 1}, ${markPending ? "N'pending'" : "N'synced'"});
  `);
}

async function updateRows(tx, table, values, match) {
  assertTable(table);
  const known = await tableColumns(table);
  const request = new sql.Request(tx);
  const sets = [];
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key.toLowerCase())) continue;
    bind(request, `set_${key}`, value);
    sets.push(`[${key}] = @set_${key}`);
  }
  if (!sets.length) return;
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
  // Offline tills refuse the same deletes the central database refuses, so a
  // product that appears on a past bill can never be removed here either.
  if (table === "products" && match && match.id) {
    const guard = new sql.Request(tx);
    bind(guard, "pid", match.id);
    const used = await guard.query(
      "SELECT TOP 1 1 AS hit FROM dbo.[sale_items] WHERE [product_id] = @pid;",
    );
    if (used.recordset && used.recordset.length) {
      throw new Error("PRODUCT_HAS_SALES_HISTORY: it appears on past sales");
    }
  }
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
       SET is_synced = 1, sync_status = N'synced', synced_at = SYSUTCDATETIME(),
           updated_at = updated_at
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

/**
 * Device settings kept in the branch database (activation token, bound branch,
 * connection details) so they survive a cleared browser and an app update.
 */
async function getSetting(key) {
  const res = await getPool()
    .request()
    .input("key", sql.NVarChar(120), key)
    .query("SELECT [value] FROM dbo.system_settings WHERE [key] = @key;");
  return res.recordset[0]?.value ?? null;
}

async function setSetting(key, value) {
  await getPool()
    .request()
    .input("key", sql.NVarChar(120), key)
    .input("value", sql.NVarChar(sql.MAX), value == null ? null : String(value))
    .query(`
      MERGE dbo.system_settings AS t
      USING (SELECT @key AS [key], @value AS [value]) AS s ON t.[key] = s.[key]
      WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
    `);
}

/**
 * Commits a completed bill to the local branch database in one transaction:
 * the sale header, every line, the stock movement and the member update all
 * land together or not at all. Rows are stamped `is_synced = 0` so the
 * background worker pushes them whenever the branch is back online.
 */
async function createSale({ sale, items, products = [], member = null, branchId = null, exchangeOfBillNumber = null }) {
  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await upsertRow(tx, "sales", { ...sale, branch_id: sale.branch_id ?? branchId });
    for (const line of items) {
      await upsertRow(tx, "sale_items", { ...line, branch_id: line.branch_id ?? branchId });
    }
    for (const product of products) await upsertRow(tx, "products", product);
    if (member) await upsertRow(tx, "members", member);
    if (exchangeOfBillNumber) {
      await updateRows(
        tx,
        "sales",
        { exchanged_to_bill_number: sale.bill_number },
        { bill_number: exchangeOfBillNumber },
      );
    }
    await tx.commit();
    return { id: sale.id, billNumber: sale.bill_number };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/** Full local catalogue — the register never fetches products over HTTP. */
async function getProducts() {
  const res = await getPool().request().query("SELECT * FROM dbo.products ORDER BY name ASC;");
  return res.recordset.map((row) => parseJsonColumns("products", row));
}

async function rows(table) {
  assertTable(table);
  const result = await getPool().request().query(`SELECT * FROM dbo.[${table}];`);
  return result.recordset.map((row) => parseJsonColumns(table, row));
}

async function snapshot() {
  const [products, members, stores, shifts, promotions, tiers, settings] = await Promise.all([
    rows("products"), rows("members"), rows("stores"), rows("shifts"), rows("promotions"),
    rows("membership_tiers"), rows("pos_settings"),
  ]);
  const setting = settings[0];
  const payload = setting
    ? (typeof setting.payload === "string" ? JSON.parse(setting.payload) : setting.payload)
    : null;
  return { products, members, stores, shifts, promotions, tiers, settings: payload };
}

/** How many locally-created rows are still waiting for the central server. */
async function pendingSyncCount() {
  let total = 0;
  let sales = 0;
  for (const table of TABLES) {
    const res = await getPool()
      .request()
      .query(`SELECT COUNT(*) AS n FROM dbo.[${table}] WHERE is_synced = 0;`);
    const n = res.recordset[0]?.n ?? 0;
    total += n;
    if (table === "sales") sales = n;
  }
  return { total, sales };
}

/** Strips local-only bookkeeping before a row is sent to the cloud. */
function toCloudRow(table, row) {
  const { is_synced: _s, sync_status: _st, ...rest } = row;
  if (table === "pos_settings") {
    const payload = typeof rest.payload === "string" ? JSON.parse(rest.payload) : rest.payload;
    return { id: 1, ...payload };
  }
  return parseJsonColumns(table, rest);
}

module.exports = {
  TABLES,
  CATALOGUE_TABLES,
  SETTINGS_ID,
  applyOp,
  createSale,
  getProducts,
  snapshot,
  pendingSyncCount,
  pendingRows,
  markSynced,
  markFailed,
  retryErrored,
  mergeFromCloud,
  stats,
  getState,
  setState,
  getSetting,
  setSetting,
  toCloudRow,
};