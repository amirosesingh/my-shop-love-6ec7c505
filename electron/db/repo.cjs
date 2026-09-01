/**
 * Table helpers: turn the app's serialisable sync operations into parameterised
 * T-SQL, and expose the queries the sync worker needs.
 */
const poolDb = require("./pool.cjs");
const { sql, getPool } = poolDb;

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/** Tables in dependency order — parents push before their children. */
const TABLES = [
  "stores",
  "membership_tiers",
  "products",
  "product_barcodes",
  "product_categories",
  "uom_units",
  "members",
  "promotions",
  "pos_settings",
  "suppliers",
  "shifts",
  // Sign-in visibility and drawer openings are written by the till too; they
  // must be on this list or every write is refused as an unknown table.
  "shift_sessions",
  // Controlled shift closing: blind counts, state transitions, the computed
  // reconciliation and any variance alert all belong to the trading record.
  "shift_cash_counts",
  "shift_close_events",
  "shift_reconciliations",
  "shift_variance_alerts",
  "drawer_events",

  "sales",
  "sale_items",
  "payment_transactions",
  "item_activity_logs",
  "purchase_orders",
  "purchase_order_items",
  "bookings",
  "booking_payments",
  "transfers",
  "stock_transfers",
  "stock_transfer_items",
  "stock_adjustments",
  "stock_count_drafts",
  "held_orders",
  "audit_logs",
];

/** Cloud is authoritative for these; they are the only tables ever pulled. */
const CATALOGUE_TABLES = [
  "stores",
  "membership_tiers",
  "products",
  "product_barcodes",
  "product_categories",
  "uom_units",
  "promotions",
  "suppliers",
];

/**
 * Operational data this branch also needs to see from elsewhere.
 *
 * Members are shared across the whole business: someone who signs up at one
 * shop must earn points at the next. Transfers and bookings are pulled only
 * where this branch is involved, so a till never downloads another shop's
 * work — and so a transfer sent here can be received with no connection.
 */
const SCOPED_PULL_TABLES = [
  { table: "members" },
  { table: "stock_transfers", storeColumns: ["from_store_id", "to_store_id"] },
  { table: "stock_transfer_items", parent: { table: "stock_transfers", column: "transfer_id" } },
  { table: "bookings", storeColumns: ["store_id"] },
  { table: "booking_payments", parent: { table: "bookings", column: "booking_id" } },
];

/** Branch and till this install acts as; scopes the sync watermarks. */
let scope = { storeId: "", terminalId: "" };

function setScope({ storeId, terminalId } = {}) {
  scope = {
    storeId: storeId ? String(storeId) : "",
    terminalId: terminalId ? String(terminalId) : "",
  };
  return scope;
}

/**
 * Tables housekeeping may prune once the cloud has confirmed the row. Reference
 * data (products, members, stores, settings …) is never pruned: the till reads
 * it offline.
 */
const PRUNABLE_TABLES = [
  "sale_items",
  "sales",
  "purchase_order_items",
  "purchase_orders",
  "booking_payments",
  "bookings",
  "stock_transfer_items",
  "stock_transfers",
  "transfers",
  "stock_adjustments",
  "audit_logs",
];

/**
 * Columns the central database actually has, per pushed table (verified
 * against the live schema). A till's local schema can drift ahead of or
 * behind the cloud; pushing a column the cloud does not have makes PostgREST
 * reject the whole batch, which is how payments used to silently never sync.
 * Anything not listed here is dropped from the push payload (and logged
 * once), so drift degrades to a warning instead of a sync outage.
 */
// Single source of truth: ./cloud-columns.json. The web Schema manager
// compares the central schema against this same push contract, so a column
// only ever has to be listed in one place.
const CLOUD_COLUMNS_JSON = require("./cloud-columns.json");
const CLOUD_COLUMNS = {};
for (const key of Object.keys(CLOUD_COLUMNS_JSON)) {
  CLOUD_COLUMNS[key] = new Set(CLOUD_COLUMNS_JSON[key]);
}

/**
 * Only tables the central database actually has are ever pushed. Legacy
 * local-only tables (e.g. `transfers`) stay writable locally but leave the
 * sync loop, so they can no longer fail every cycle against a 404.
 */
const PUSH_TABLES = TABLES.filter((t) => CLOUD_COLUMNS[t]);

/** One console line per table when drift drops columns, not one per row. */
const driftLogged = new Set();
function filterCloudColumns(table, row) {
  const allowed = CLOUD_COLUMNS[table];
  if (!allowed) return row;
  const out = {};
  const dropped = [];
  for (const [key, value] of Object.entries(row)) {
    if (allowed.has(key)) out[key] = value;
    else dropped.push(key);
  }
  if (dropped.length && !driftLogged.has(table)) {
    driftLogged.add(table);
    console.warn(
      `[sync] ${table}: local column(s) not present centrally were dropped from the push: ${dropped.join(", ")}`,
    );
  }
  return out;
}

const SYNC_COLUMNS = new Set(["is_synced", "sync_status", "synced_at", "sync_error"]);

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

/* ================= on-demand schema self-heal ================= */

/**
 * Sync bookkeeping columns are added by the engine's shared cursor batches,
 * so the per-table manifest never declares them. Their types live here so a
 * table created before the sync engine existed can still grow them on demand.
 */
const ENGINE_COLUMN_TYPES = {
  is_synced: "BIT",
  sync_status: "NVARCHAR(20)",
  synced_at: "DATETIME2",
  sync_error: "NVARCHAR(MAX)",
  sync_attempts: "INT",
  last_error_at: "DATETIME2",
  pending_sync: "BIT",
  temp_id: "NVARCHAR(120)",
  row_version: "INT",
};

/** Distinct error shape the UI recognises and turns into an admin prompt. */
function schemaPermissionError(table, detail) {
  const err = new Error(
    `Missing database structure (${table || "schema"}) could not be created: ` +
      `${detail || "the sign-in has no permission to create or alter tables"}. ` +
      `Open Settings → Local database and run the repair with an admin login.`,
  );
  err.code = "ESCHEMA_PERMISSION";
  err.table = table ?? null;
  return err;
}

/**
 * Turns a schema-drift failure into a one-time repair. Resolves true when the
 * caller should retry the exact same operation; false when the error was not
 * schema-related. Permission failures throw so the till can ask for an admin
 * login instead of silently retrying forever.
 */
async function healFromError(err, candidateTables = []) {
  const full = `${err?.message ?? ""} ${err?.originalError?.message ?? ""}`;
  const objectMatch = /invalid object name\s+'(?:dbo\.)?\[?([^\]'.\s]+)\]?'/i.exec(full);
  if (objectMatch) {
    const heal = await poolDb.ensureSchemaTable(objectMatch[1]);
    if (heal.ok) return true;
    if (heal.permission) throw schemaPermissionError(objectMatch[1], heal.errors?.[0]?.error);
    return false;
  }
  const columnMatch = /invalid column name\s+'\[?([^\]']+)\]?'/i.exec(full);
  if (columnMatch) {
    const column = columnMatch[1];
    for (const table of candidateTables) {
      if (!table) continue;
      const type =
        poolDb.schemaColumnType(table, column)?.type ??
        ENGINE_COLUMN_TYPES[String(column).toLowerCase()] ??
        null;
      if (!type) continue;
      const heal = await poolDb.ensureColumn(table, column, type);
      if (heal.ok) return true;
      if (heal.permission) throw schemaPermissionError(table, heal.error);
    }
    return false;
  }
  if (poolDb.isDdlPermissionError(err)) {
    throw schemaPermissionError(candidateTables[0] ?? "", err?.message);
  }
  return false;
}

/** Runs fn, and exactly once more when a missing table/column was repaired. */
async function withHeal(tables, fn) {
  try {
    return await fn();
  } catch (err) {
    if (await healFromError(err, Array.isArray(tables) ? tables : [tables])) {
      return fn();
    }
    throw err;
  }
}

/**
 * Proactive column growth before a transaction opens: a write carrying a
 * column the master schema declares but this till has not grown yet gets the
 * column added, so the value is kept instead of being silently dropped.
 */
async function healOpsColumns(ops) {
  for (const op of ops ?? []) {
    if (!op?.table || !TABLES.includes(op.table)) continue;
    const opRows = op.rows ?? (op.values ? [op.values] : null);
    if (!opRows?.length) continue;
    const known = await tableColumns(op.table).catch(() => null);
    if (!known || !known.size) continue; // a missing table heals from the error path
    for (const row of opRows.slice(0, 5)) {
      for (const key of Object.keys(row)) {
        if (SYNC_COLUMNS.has(key) || known.has(key.toLowerCase())) continue;
        const decl = poolDb.schemaColumnType(op.table, key);
        if (!decl) continue; // truly unknown columns are still dropped with a warning
        const heal = await poolDb.ensureColumn(op.table, key, decl.type);
        if (heal.ok) known.add(key.toLowerCase());
        else if (heal.permission) throw schemaPermissionError(op.table, heal.error);
      }
    }
  }
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
  products: ["stock_by_store", "packs", "barcode_aliases", "barcode_variants"],
  promotions: ["tier_rates"],
  bookings: ["lines", "charges"],
  transfers: ["items"],
  audit_logs: ["details"],
  held_orders: ["lines", "coupon"],
};

function parseJsonColumns(table, row) {
  const copy = { ...row };
  for (const column of JSON_COLUMNS[table] ?? []) {
    if (typeof copy[column] !== "string") continue;
    try {
      copy[column] = JSON.parse(copy[column]);
    } catch {
      /* preserve invalid legacy text */
    }
  }
  return copy;
}

/**
 * Builds the `UPDATE SET` list for a MERGE, guaranteeing each column appears
 * exactly once. SQL Server rejects the whole statement if a column is assigned
 * twice, which is what happened when a cloud row carried its own `updated_at`
 * next to the automatic `SYSUTCDATETIME()` stamp.
 */
function buildSetList(columns, { markPending, hasRowVersion }) {
  const assigned = new Map();
  const put = (column, expression) => assigned.set(column, `t.[${column}] = ${expression}`);

  for (const c of columns) {
    if (c === "id") continue;
    if (markPending && c === "row_version") continue;
    put(c, `s.[${c}]`);
  }

  // A local edit is stamped with the local clock; a cloud row keeps the
  // timestamp it arrived with so watermarks and last-write-wins stay honest.
  if (markPending || !columns.includes("updated_at")) {
    put("updated_at", "SYSUTCDATETIME()");
  }

  if (markPending) {
    put("is_synced", "0");
    put("sync_status", "N'pending'");
    // A local edit always advances the version so the cloud copy cannot
    // silently win the next pull.
    if (hasRowVersion) put("row_version", "ISNULL(t.[row_version], 0) + 1");
  }

  return [...assigned.values()].join(", ");
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

  const setList = buildSetList(columns, {
    markPending,
    hasRowVersion: known.has("row_version"),
  });

  const insertCols = columns.map((c) => `[${c}]`).join(", ");
  const insertVals = columns.map((c) => `s.[${c}]`).join(", ");
  const source = columns.map((c) => `@${c} AS [${c}]`).join(", ");

  await request.query(`
    MERGE dbo.[${table}] WITH (HOLDLOCK) AS t
    USING (SELECT ${source}) AS s ON t.[id] = s.[id]
    WHEN MATCHED ${
      markPending
        ? ""
        : // Server copy wins only when it is genuinely newer, and never over a
          // local change that has not reached the cloud yet.
          `AND t.[is_synced] = 1 ${
            columns.includes("row_version")
              ? "AND ISNULL(s.[row_version], 0) >= ISNULL(t.[row_version], 0) "
              : ""
          }`
    }THEN UPDATE SET ${setList}
    WHEN NOT MATCHED THEN INSERT (${insertCols}, [is_synced], [sync_status])
      VALUES (${insertVals}, ${markPending ? 0 : 1}, ${markPending ? "N'pending'" : "N'synced'"});
  `);
}

async function updateRows(tx, table, values, match) {
  assertTable(table);
  const known = await tableColumns(table);
  const request = new sql.Request(tx);
  const sets = new Map();
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key.toLowerCase())) continue;
    // Sync bookkeeping is owned by this function, never by the caller.
    if (key === "updated_at" || SYNC_COLUMNS.has(key)) continue;
    bind(request, `set_${key}`, value);
    sets.set(key, `[${key}] = @set_${key}`);
  }
  if (!sets.size) return;
  const wheres = [];
  for (const [key, value] of Object.entries(match)) {
    bind(request, `w_${key}`, value);
    wheres.push(`[${key}] = @w_${key}`);
  }
  await request.query(`
    UPDATE dbo.[${table}]
       SET ${[...sets.values()].join(", ")}, [updated_at] = SYSUTCDATETIME(),
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
async function applyOpInTransaction(tx, op) {
  if (op.kind === "insert" || op.kind === "upsert") {
    for (const row of op.rows ?? []) await upsertRow(tx, op.table, row);
  } else if (op.kind === "update") {
    await updateRows(tx, op.table, op.values ?? {}, op.match ?? {});
  } else if (op.kind === "delete") {
    await deleteRows(tx, op.table, op.match ?? {});
  } else {
    throw new Error(`Unsupported operation: ${op.kind}`);
  }
}

async function applyOpsOnce(ops) {
  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const op of ops ?? []) await applyOpInTransaction(tx, op);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Entry point for app writes. Schema drift is repaired before the transaction
 * opens (new columns) and once more from the error itself (missing tables),
 * so an out-of-date local database no longer fails the sale.
 */
async function applyOps(ops) {
  await healOpsColumns(ops);
  try {
    return await applyOpsOnce(ops);
  } catch (err) {
    const tables = (ops ?? []).map((o) => o?.table).filter(Boolean);
    if (await healFromError(err, tables)) return applyOpsOnce(ops);
    throw err;
  }
}

async function applyOp(op) {
  return applyOps([op]);
}

async function pendingRows(table, limit = 200) {
  assertTable(table);
  return withHeal(table, async () => {
    const res = await getPool().request().input("limit", sql.Int, limit).query(`
        SELECT TOP (@limit) * FROM dbo.[${table}]
         WHERE is_synced = 0 AND sync_status <> N'quarantined'
         ORDER BY created_at ASC;
      `);
    return res.recordset;
  });
}

async function markSynced(table, ids) {
  if (!ids.length) return;
  assertTable(table);
  return withHeal(table, async () => {
    const request = getPool().request();
    // Most keys are GUIDs, but held tickets carry the app's own string id.
    ids.forEach((id, i) => bind(request, `id${i}`, id));
    await request.query(`
      UPDATE dbo.[${table}]
         SET is_synced = 1, sync_status = N'synced', synced_at = SYSUTCDATETIME(),
             updated_at = updated_at
       WHERE id IN (${ids.map((_, i) => `@id${i}`).join(", ")});
    `);
  });
}

/**
 * Repeated failures park the row so one bad record can't block the queue.
 * The attempt counter and the quarantine decision are both persisted here, in
 * SQL — a till restart can no longer unpark a row that already failed five
 * times, which the old in-memory counter allowed.
 */
async function markFailed(table, ids, message, maxAttempts = 5) {
  if (!ids.length) return;
  assertTable(table);
  return withHeal([table, "sync_state"], async () => {
    const request = getPool()
      .request()
      .input("maxAttempts", sql.Int, Math.max(1, Number(maxAttempts) || 5))
      .input("msg", sql.NVarChar(sql.MAX), String(message).slice(0, 3000));
    ids.forEach((id, i) => bind(request, `id${i}`, id));
    await request.query(`
      UPDATE dbo.[${table}]
         SET sync_status = CASE
               WHEN ISNULL(sync_attempts, 0) + 1 >= @maxAttempts THEN N'quarantined'
               ELSE N'error'
             END,
             sync_error = @msg,
             sync_attempts = ISNULL(sync_attempts, 0) + 1,
             last_error_at = SYSUTCDATETIME()
       WHERE id IN (${ids.map((_, i) => `@id${i}`).join(", ")});
      MERGE dbo.sync_state AS t
      USING (SELECT N'last_error' AS [key], @msg AS [value]) AS s ON t.[key] = s.[key]
      WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
    `);
  });
}

async function retryErrored() {
  for (const table of PUSH_TABLES) {
    await withHeal(table, () =>
      getPool()
        .request()
        .query(
          `UPDATE dbo.[${table}] SET sync_status = N'pending', sync_error = NULL,
                  sync_attempts = 0, last_error_at = NULL
            WHERE is_synced = 0 AND sync_status IN (N'error', N'quarantined');`,
        ),
    );
  }
}

/** Puts a single parked row back at the front of the queue. */
async function retryRow(table, id) {
  assertTable(table);
  return withHeal(table, async () => {
    const request = getPool().request();
    bind(request, "id", id);
    await request.query(
      `UPDATE dbo.[${table}] SET sync_status = N'pending', sync_error = NULL,
              sync_attempts = 0, last_error_at = NULL, is_synced = 0
        WHERE id = @id;`,
    );
  });
}

/**
 * Row-level view behind the sync status table: everything not yet confirmed by
 * the cloud, failures first so a red badge is never buried.
 */
/**
 * Drops a change that can never succeed. The row stays in the local database
 * for the record, but the queue stops trying to send it.
 */
async function discardRow(table, id) {
  assertTable(table);
  return withHeal(table, async () => {
    const request = getPool().request();
    bind(request, "id", id);
    await request.query(
      `UPDATE dbo.[${table}]
          SET is_synced = 1, sync_status = N'discarded', synced_at = SYSUTCDATETIME()
        WHERE id = @id;`,
    );
  });
}

async function queueRows(limit = 100) {
  const rows = [];
  for (const table of PUSH_TABLES) {
    const read = () =>
      getPool().request().input("limit", sql.Int, limit).query(`
          SELECT TOP (@limit)
                 CONVERT(NVARCHAR(64), id) AS id,
                 sync_status,
                 sync_error,
                 CONVERT(NVARCHAR(40), updated_at, 127) AS updated_at
            FROM dbo.[${table}]
           WHERE is_synced = 0
           ORDER BY CASE WHEN sync_status IN (N'error', N'quarantined') THEN 0 ELSE 1 END,
                    updated_at DESC;
        `);
    let res;
    try {
      res = await read();
    } catch (err) {
      // A table the local schema hasn't grown yet is repaired on the spot;
      // only a failed repair removes it from this listing.
      try {
        if (!(await healFromError(err, [table]))) continue;
        res = await read();
      } catch {
        continue;
      }
    }
    for (const row of res.recordset) {
      rows.push({
        table,
        id: row.id,
        status: row.sync_status,
        error: row.sync_error ?? null,
        updatedAt: row.updated_at ?? null,
      });
    }
    if (rows.length >= limit) break;
  }
  rows.sort((a, b) => {
    const rank = (s) => (s === "error" || s === "quarantined" ? 0 : 1);
    return rank(a.status) - rank(b.status);
  });
  return rows.slice(0, limit);
}

/** Cloud rows land through MERGE and are flagged as already synced. */
async function mergeFromCloud(table, rows) {
  if (!rows.length) return 0;
  await healOpsColumns([{ table, rows }]);
  return withHeal(table, async () => {
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
  });
}

/**
 * Shop-side half of the server/shop comparison.
 *
 * Counts are read live from the tables themselves — never from the sync
 * counters — so a queue that silently stopped still shows up as a difference.
 * `since` is an ISO timestamp; null compares everything.
 */
async function compareSummary({ since = null, tables = TABLES } = {}) {
  const wanted = tables.filter((t) => TABLES.includes(t));
  const out = [];
  for (const table of wanted) {
    const columns = await tableColumns(table).catch(() => new Set());
    if (!columns.size) {
      out.push({ table, missing: true, count: 0, maxUpdatedAt: null, pending: 0, errored: 0 });
      continue;
    }
    const stamp = columns.has("updated_at")
      ? "updated_at"
      : columns.has("created_at")
        ? "created_at"
        : null;
    const where = since && stamp ? `WHERE [${stamp}] >= @since` : "";
    const request = getPool().request();
    if (since && stamp) request.input("since", sql.DateTime2, new Date(since));
    try {
      const res = await request.query(`
        SELECT COUNT(*) AS total,
               ${stamp ? `CONVERT(NVARCHAR(40), MAX([${stamp}]), 127)` : "NULL"} AS newest,
               ${columns.has("is_synced") ? "SUM(CASE WHEN is_synced = 0 THEN 1 ELSE 0 END)" : "0"} AS pending,
               ${
                 columns.has("sync_status")
                   ? "SUM(CASE WHEN sync_status IN (N'error', N'quarantined') THEN 1 ELSE 0 END)"
                   : "0"
               } AS errored
          FROM dbo.[${table}] ${where};
      `);
      const row = res.recordset[0] ?? {};
      out.push({
        table,
        missing: false,
        count: Number(row.total ?? 0),
        maxUpdatedAt: row.newest ?? null,
        pending: Number(row.pending ?? 0),
        errored: Number(row.errored ?? 0),
      });
    } catch (err) {
      out.push({
        table,
        missing: false,
        error: err?.message ?? String(err),
        count: 0,
        maxUpdatedAt: null,
        pending: 0,
        errored: 0,
      });
    }
  }
  return out;
}

/** Row keys for one table, used to work out exactly which records differ. */
async function compareRows(table, { since = null, limit = 2000 } = {}) {
  assertTable(table);
  const columns = await tableColumns(table).catch(() => new Set());
  if (!columns.size) return [];
  const stamp = columns.has("updated_at")
    ? "updated_at"
    : columns.has("created_at")
      ? "created_at"
      : null;
  const request = getPool().request().input("limit", sql.Int, Math.min(limit, 5000));
  if (since && stamp) request.input("since", sql.DateTime2, new Date(since));
  const res = await request.query(`
    SELECT TOP (@limit)
           CONVERT(NVARCHAR(64), id) AS id,
           ${stamp ? `CONVERT(NVARCHAR(40), [${stamp}], 127)` : "NULL"} AS updated_at,
           ${columns.has("sync_status") ? "sync_status" : "NULL"} AS sync_status
      FROM dbo.[${table}]
     ${since && stamp ? `WHERE [${stamp}] >= @since` : ""}
     ${stamp ? `ORDER BY [${stamp}] DESC` : ""};
  `);
  return res.recordset.map((r) => ({
    id: r.id,
    updatedAt: r.updated_at ?? null,
    status: r.sync_status ?? null,
  }));
}

async function stats() {
  const out = [];
  for (const table of PUSH_TABLES) {
    try {
      const res = await withHeal(table, () =>
        getPool().request().query(`
          SELECT
            SUM(CASE WHEN is_synced = 0 AND sync_status = N'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced,
            SUM(CASE WHEN sync_status IN (N'error', N'quarantined') THEN 1 ELSE 0 END) AS errored
          FROM dbo.[${table}];
        `),
      );
      const r = res.recordset[0] ?? {};
      out.push({
        table,
        pending: r.pending ?? 0,
        synced: r.synced ?? 0,
        errored: r.errored ?? 0,
      });
    } catch (err) {
      // One broken table must never blank the whole sync overview.
      out.push({
        table,
        pending: 0,
        synced: 0,
        errored: 0,
        error: err?.message ?? String(err),
      });
    }
  }
  return out;
}

async function getState(key) {
  return withHeal("sync_state", async () => {
    const res = await getPool()
      .request()
      .input("key", sql.NVarChar(60), key)
      .query("SELECT [value] FROM dbo.sync_state WHERE [key] = @key;");
    return res.recordset[0]?.value ?? null;
  });
}

/**
 * Per-table high-water marks. The puller resumes each table from its own
 * `last_synced_at`, so one slow table never holds the others back.
 */
async function getWatermark(table) {
  return withHeal("sync_metadata", async () => {
    const res = await getPool()
      .request()
      .input("t", sql.NVarChar(120), table)
      .input("store", sql.NVarChar(60), scope.storeId)
      .input("term", sql.NVarChar(80), scope.terminalId)
      .query(
        `SELECT last_synced_at FROM dbo.sync_metadata
          WHERE table_name = @t AND store_id = @store AND terminal_id = @term;`,
      );
    const at = res.recordset[0]?.last_synced_at ?? null;
    return at ? new Date(at).toISOString() : null;
  });
}

async function setWatermark(table, isoAt, { rowsPushed = 0, error = null, pushed = false } = {}) {
  return withHeal("sync_metadata", () =>
    getPool()
      .request()
      .input("t", sql.NVarChar(120), table)
      .input("store", sql.NVarChar(60), scope.storeId)
      .input("term", sql.NVarChar(80), scope.terminalId)
      .input("at", sql.DateTime2, isoAt ? new Date(isoAt) : null)
      .input("rows", sql.Int, rowsPushed)
      .input("pushed", sql.Bit, pushed ? 1 : 0)
      .input("err", sql.NVarChar(sql.MAX), error ? String(error).slice(0, 3000) : null).query(`
        MERGE dbo.sync_metadata AS t
        USING (SELECT @t AS table_name, @store AS store_id, @term AS terminal_id) AS s
          ON t.table_name = s.table_name AND t.store_id = s.store_id AND t.terminal_id = s.terminal_id
        WHEN MATCHED THEN UPDATE SET
          t.last_synced_at = ISNULL(@at, t.last_synced_at),
          t.last_pushed_at = CASE WHEN @pushed = 1 THEN SYSUTCDATETIME() ELSE t.last_pushed_at END,
          t.rows_pushed = t.rows_pushed + @rows,
          t.last_error = @err,
          t.updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (table_name, store_id, terminal_id, last_synced_at, last_pushed_at, rows_pushed, last_error)
          VALUES (@t, @store, @term, @at,
                  CASE WHEN @pushed = 1 THEN SYSUTCDATETIME() ELSE NULL END, @rows, @err);
      `),
  );
}

async function setState(key, value) {
  return withHeal("sync_state", () =>
    getPool()
      .request()
      .input("key", sql.NVarChar(60), key)
      .input("value", sql.NVarChar(400), value).query(`
        MERGE dbo.sync_state AS t
        USING (SELECT @key AS [key], @value AS [value]) AS s ON t.[key] = s.[key]
        WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
      `),
  );
}

/**
 * Device settings kept in the branch database (activation token, bound branch,
 * connection details) so they survive a cleared browser and an app update.
 */
async function getSetting(key) {
  return withHeal("system_settings", async () => {
    const res = await getPool()
      .request()
      .input("key", sql.NVarChar(120), key)
      .query("SELECT [value] FROM dbo.system_settings WHERE [key] = @key;");
    return res.recordset[0]?.value ?? null;
  });
}

async function setSetting(key, value) {
  return withHeal("system_settings", () =>
    getPool()
      .request()
      .input("key", sql.NVarChar(120), key)
      .input("value", sql.NVarChar(sql.MAX), value == null ? null : String(value)).query(`
        MERGE dbo.system_settings AS t
        USING (SELECT @key AS [key], @value AS [value]) AS s ON t.[key] = s.[key]
        WHEN MATCHED THEN UPDATE SET t.[value] = s.[value], t.updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (s.[key], s.[value]);
      `),
  );
}

/**
 * Commits a completed bill to the local branch database in one transaction:
 * the sale header, every line, the stock movement and the member update all
 * land together or not at all. Rows are stamped `is_synced = 0` so the
 * background worker pushes them whenever the branch is back online.
 */
async function createSale({
  sale,
  items,
  products = [],
  member = null,
  branchId = null,
  exchangeOfBillNumber = null,
}) {
  // Grow any schema-declared columns before the transaction opens, so a
  // behind-schedule local database keeps the data instead of dropping it.
  await healOpsColumns([
    { table: "sales", rows: [{ ...sale, branch_id: sale.branch_id ?? branchId }] },
    { table: "sale_items", rows: items.map((l) => ({ ...l, branch_id: l.branch_id ?? branchId })) },
    { table: "products", rows: products },
    ...(member ? [{ table: "members", rows: [member] }] : []),
    ...(exchangeOfBillNumber
      ? [{ table: "sales", values: { exchanged_to_bill_number: sale.bill_number } }]
      : []),
  ]);
  const run = async () => {
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
  };
  return withHeal(["sales", "sale_items", "products", "members"], run);
}

/** Full local catalogue — the register never fetches products over HTTP. */
async function getProducts() {
  return withHeal("products", async () => {
    const res = await getPool().request().query("SELECT * FROM dbo.products ORDER BY name ASC;");
    return res.recordset.map((row) => parseJsonColumns("products", row));
  });
}

async function rows(table) {
  assertTable(table);
  return withHeal(table, async () => {
    const result = await getPool().request().query(`SELECT * FROM dbo.[${table}];`);
    return result.recordset.map((row) => parseJsonColumns(table, row));
  });
}

async function snapshot() {
  const [products, members, stores, shifts, promotions, tiers, settings] = await Promise.all([
    rows("products"),
    rows("members"),
    rows("stores"),
    rows("shifts"),
    rows("promotions"),
    rows("membership_tiers"),
    rows("pos_settings"),
  ]);
  const setting = settings[0];
  const payload = setting
    ? typeof setting.payload === "string"
      ? JSON.parse(setting.payload)
      : setting.payload
    : null;
  return { products, members, stores, shifts, promotions, tiers, settings: payload };
}

/** How many locally-created rows are still waiting for the central server. */
async function pendingSyncCount() {
  let total = 0;
  let sales = 0;
  for (const table of PUSH_TABLES) {
    try {
      const res = await withHeal(table, () =>
        getPool()
          .request()
          .query(`SELECT COUNT(*) AS n FROM dbo.[${table}] WHERE is_synced = 0;`),
      );
      const n = res.recordset[0]?.n ?? 0;
      total += n;
      if (table === "sales") sales = n;
    } catch {
      // A table that could not be repaired simply has no countable backlog.
    }
  }
  return { total, sales };
}

/**
 * Housekeeping: reclaim space taken by rows the central database has already
 * confirmed, then tidy the indexes. Anything still waiting to sync, anything
 * newer than the retention window, and all reference data are left alone.
 */
async function housekeep({ retentionDays = 90 } = {}) {
  const days = Math.max(7, Math.round(Number(retentionDays) || 90));
  const pool = getPool();
  const removed = [];
  let total = 0;
  for (const table of PRUNABLE_TABLES) {
    // A till that has never had the confirmation stamp keeps everything.
    const columns = await tableColumns(table);
    if (!columns.has("synced_at")) continue;
    try {
      const res = await pool.request().input("days", sql.Int, days).query(`
          DELETE FROM dbo.[${table}]
           WHERE is_synced = 1
             AND synced_at IS NOT NULL
             AND synced_at < DATEADD(day, -@days, SYSUTCDATETIME());
          SELECT @@ROWCOUNT AS n;
        `);
      const n = res.recordset?.[0]?.n ?? 0;
      if (n > 0) removed.push({ table, rows: n });
      total += n;
    } catch (err) {
      // A table a till hasn't migrated to yet must not stop the sweep.
      removed.push({ table, rows: 0, error: err.message });
    }
  }
  try {
    await pool.request().query(`
      DECLARE @tbl SYSNAME, @sqlReorg NVARCHAR(MAX);
      DECLARE hk CURSOR FOR SELECT name FROM sys.tables;
      OPEN hk; FETCH NEXT FROM hk INTO @tbl;
      WHILE @@FETCH_STATUS = 0
      BEGIN
        SET @sqlReorg = N'ALTER INDEX ALL ON dbo.[' + @tbl + N'] REORGANIZE;';
        BEGIN TRY EXEC sp_executesql @sqlReorg; END TRY BEGIN CATCH END CATCH;
        FETCH NEXT FROM hk INTO @tbl;
      END
      CLOSE hk; DEALLOCATE hk;
    `);
  } catch {
    /* index tidy-up is best effort */
  }
  await setState("last_housekeeping_at", new Date().toISOString());
  await setState("last_housekeeping_rows", String(total));
  return { ok: true, retentionDays: days, removedRows: total, tables: removed };
}

/** Strips local-only bookkeeping before a row is sent to the cloud. */
function toCloudRow(table, row) {
  // Local-only bookkeeping never leaves the till.
  const {
    is_synced: _s,
    sync_status: _st,
    synced_at: _sa,
    sync_error: _se,
    sync_attempts: _at,
    last_error_at: _le,
    pending_sync: _ps,
    temp_id: _ti,
    ...rest
  } = row;
  if (table === "pos_settings") {
    const payload = typeof rest.payload === "string" ? JSON.parse(rest.payload) : rest.payload;
    return { id: 1, ...payload };
  }
  // The version counter travels with the row on purpose: the central database
  // compares it and keeps whichever copy is newer, so a till that was offline
  // cannot overwrite an edit made elsewhere in the meantime. If this till's
  // change is skipped centrally, the next pull brings the newer copy down.
  const out = parseJsonColumns(table, rest);
  if (typeof row.row_version !== "number") delete out.row_version;
  // Never send a column the central database does not have: one unknown key
  // makes PostgREST refuse the whole batch.
  return filterCloudColumns(table, out);
}

module.exports = {
  TABLES,
  PUSH_TABLES,
  CLOUD_COLUMNS,
  buildSetList,
  CATALOGUE_TABLES,
  SCOPED_PULL_TABLES,
  PRUNABLE_TABLES,
  SETTINGS_ID,
  setScope,
  applyOp,
  applyOps,
  createSale,
  forgetColumnCache,
  getProducts,
  housekeep,
  snapshot,
  pendingSyncCount,
  pendingRows,
  markSynced,
  markFailed,
  retryErrored,
  retryRow,
  discardRow,
  queueRows,
  mergeFromCloud,
  stats,
  compareSummary,
  compareRows,
  getState,
  setState,
  getWatermark,
  setWatermark,
  getSetting,
  setSetting,
  toCloudRow,
};
