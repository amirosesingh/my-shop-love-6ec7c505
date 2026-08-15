/**
 * Embedded local database — `userData/local_pos_database.db`.
 *
 * Runs on Node's built-in SQLite (Electron 43 ships Node 22), so there is no
 * native module to rebuild. There is deliberately no file-based fallback: if
 * the engine cannot be opened the local store reports itself unavailable and
 * the app fails over to the central database instead of writing loose files.
 *
 * Schema, pragmas and indexes live in `offline_sqlite_v2.sql` next to this
 * file. Every write runs inside a `BEGIN IMMEDIATE` transaction.
 */
const fs = require("node:fs");
const path = require("node:path");

const MIRROR_ENTITIES = [
  "products",
  "barcodes",
  "customers",
  "service_jobs",
  "payment_ledgers",
  "settings",
];

let db = null;
let dbPath = null;
let lastError = null;
/** Branch/till this install is currently acting as (scopes the watermarks). */
let scope = { storeId: "", terminalId: "" };

/** Attempts a queued change gets before it is parked for an operator. */
const MAX_ATTEMPTS = 10;

/** Local mirror tables that carry sync bookkeeping columns. */
const SYNCED_TABLES = [
  "products",
  "product_barcodes",
  "members",
  "shifts",
  "sales",
  "sale_items",
  "bookings",
  "booking_payments",
  "payment_transactions",
  "item_activity_logs",
  "stock_adjustments",
  "suppliers",
  "product_categories",
  "uom_units",
  "membership_tiers",
  "promotions",
  "purchase_orders",
  "purchase_order_items",
  "stock_transfers",
  "stock_transfer_items",
  "held_orders",
];

const nowIso = () => new Date().toISOString();
const uuid = () => require("node:crypto").randomUUID();

/* -------------------------------- init -------------------------------- */

function init(directory) {
  dbPath = path.join(directory, "local_pos_database.db");
  try {
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(dbPath);
    // Pragmas + typed mirrors + offline_sync_queue live in offline_sqlite_v2.sql
    // so the local shape stays reviewable next to the cloud schema.
    db.exec(fs.readFileSync(path.join(__dirname, "offline_sqlite_v2.sql"), "utf8"));
    migrate();
    drainLegacyOutbox();
    lastError = null;
    return { ok: true, engine: "sqlite", path: dbPath };
  } catch (error) {
    db = null;
    lastError = error instanceof Error ? error.message : String(error);
    // No JSON/disk fallback by design — the caller routes to the cloud.
    return { ok: false, engine: "none", path: dbPath, error: lastError };
  }
}

/**
 * Run a unit of work as one atomic transaction. `BEGIN IMMEDIATE` takes the
 * write lock up front so two windows can never interleave a half-written sale.
 */
function tx(work) {
  if (!db) return null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = work();
    db.exec("COMMIT");
    return out;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* transaction already unwound */
    }
    throw error;
  }
}

/** Which columns a table actually has right now. */
function columnsOf(table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  } catch {
    return new Set();
  }
}

/**
 * Brings a database created by an earlier build up to the current shape.
 * SQLite cannot ALTER a CHECK constraint or a primary key, so the queue and
 * the watermark table are rebuilt in place when their old shape is detected;
 * everything else is a plain ADD COLUMN.
 */
function migrate() {
  // 1. Sync bookkeeping on every mirror table.
  for (const table of SYNCED_TABLES) {
    const have = columnsOf(table);
    if (!have.size) continue;
    const add = (name, ddl) => {
      if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    };
    add("is_synced", "INTEGER NOT NULL DEFAULT 0");
    add("sync_status", "TEXT NOT NULL DEFAULT 'PENDING'");
    add("row_version", "INTEGER NOT NULL DEFAULT 1");
    if (!have.has("updated_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`);
  }

  // 2. Idempotency key on the transaction tables.
  for (const table of ["sales", "sale_items"]) {
    if (!columnsOf(table).size) continue;
    if (!columnsOf(table).has("client_transaction_id")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN client_transaction_id TEXT`);
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_client_txn_idx
         ON ${table} (client_transaction_id) WHERE client_transaction_id IS NOT NULL`,
    );
  }

  // 3. Queue: DELETE actions, dead letters and persistent retry state.
  const queue = columnsOf("offline_sync_queue");
  if (queue.size) {
    if (!queue.has("last_attempt_at")) {
      db.exec(`ALTER TABLE offline_sync_queue ADD COLUMN last_attempt_at TEXT`);
    }
    if (!queue.has("client_transaction_id")) {
      db.exec(`ALTER TABLE offline_sync_queue ADD COLUMN client_transaction_id TEXT`);
    }
    const ddl =
      db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'offline_sync_queue'`)
        .get()?.sql ?? "";
    if (!ddl.includes("'DELETE'") || !ddl.includes("dead_letter")) {
      tx(() => {
        db.exec(`ALTER TABLE offline_sync_queue RENAME TO offline_sync_queue_old`);
        db.exec(`CREATE TABLE offline_sync_queue (
          id            TEXT PRIMARY KEY,
          table_name    TEXT NOT NULL,
          record_id     TEXT,
          action_type   TEXT NOT NULL DEFAULT 'INSERT' CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
          payload_json  TEXT NOT NULL,
          status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'dead_letter')),
          error_message TEXT,
          attempts      INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TEXT,
          client_transaction_id TEXT,
          created_at    TEXT NOT NULL
        )`);
        db.exec(`INSERT INTO offline_sync_queue
                   (id, table_name, record_id, action_type, payload_json, status,
                    error_message, attempts, last_attempt_at, client_transaction_id, created_at)
                 SELECT id, table_name, record_id, action_type, payload_json, status,
                        error_message, attempts, last_attempt_at, client_transaction_id, created_at
                 FROM offline_sync_queue_old`);
        db.exec(`DROP TABLE offline_sync_queue_old`);
        db.exec(
          `CREATE INDEX IF NOT EXISTS offline_sync_queue_status_idx ON offline_sync_queue (status, created_at);
           CREATE INDEX IF NOT EXISTS offline_sync_queue_table_idx ON offline_sync_queue (table_name, created_at);`,
        );
      });
    }
  }

  // 4. Watermarks keyed by table + branch + till.
  const meta = columnsOf("sync_metadata");
  if (meta.size && !meta.has("store_id")) {
    tx(() => {
      db.exec(`ALTER TABLE sync_metadata RENAME TO sync_metadata_old`);
      db.exec(`CREATE TABLE sync_metadata (
        table_name     TEXT NOT NULL,
        store_id       TEXT NOT NULL DEFAULT '',
        terminal_id    TEXT NOT NULL DEFAULT '',
        last_synced_at TEXT,
        last_pushed_at TEXT,
        rows_pushed    INTEGER NOT NULL DEFAULT 0,
        last_error     TEXT,
        updated_at     TEXT,
        PRIMARY KEY (table_name, store_id, terminal_id)
      )`);
      db.exec(`INSERT INTO sync_metadata
                 (table_name, store_id, terminal_id, last_synced_at, last_pushed_at, rows_pushed, last_error, updated_at)
               SELECT table_name, '', '', last_synced_at, last_pushed_at, rows_pushed, last_error, updated_at
               FROM sync_metadata_old`);
      db.exec(`DROP TABLE sync_metadata_old`);
    });
  }
}

/** Called by the shell once the branch and till are known. */
function setScope({ storeId, terminalId } = {}) {
  scope = { storeId: storeId ? String(storeId) : "", terminalId: terminalId ? String(terminalId) : "" };
  return scope;
}

/** Moves rows written by pre-v2 builds into the new queue, once. */
function drainLegacyOutbox() {
  try {
    tx(() =>
      db.exec(
        `INSERT OR IGNORE INTO offline_sync_queue
           (id, table_name, record_id, action_type, payload_json, status, error_message, attempts, created_at)
         SELECT id, entity, record_id, 'INSERT', payload,
                CASE WHEN status = 'failed' THEN 'failed' ELSE 'pending' END,
                error, attempts, created_at
         FROM outbox WHERE status IN ('pending', 'failed');
         DELETE FROM outbox;`,
      ),
    );
  } catch {
    /* legacy table absent or already drained */
  }
}

const ready = () => !!db;

/* ------------------------------- mirror ------------------------------- */

/** Server-wins: catalogue rows pulled from the cloud replace local copies. */
function mirror(entity, rows) {
  if (!ready() || !Array.isArray(rows) || !rows.length) return 0;
  const at = nowIso();
  return tx(() => {
    const stmt = db.prepare(
      `INSERT INTO mirror (entity, id, payload, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(entity, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    );
    for (const row of rows) {
      stmt.run(entity, String(row?.id ?? row?.key ?? uuid()), JSON.stringify(row), at);
    }
    return rows.length;
  });
}

function listMirror(entity, limit = 500) {
  if (!ready()) return [];
  return db
    .prepare(`SELECT payload FROM mirror WHERE entity = ? LIMIT ?`)
    .all(entity, limit)
    .map((r) => JSON.parse(r.payload));
}

/** Row counts per mirrored entity, for the Data Sync Hub counters. */
function counts() {
  const out = {};
  for (const entity of MIRROR_ENTITIES) {
    out[entity] = ready()
      ? db.prepare(`SELECT COUNT(*) AS n FROM mirror WHERE entity = ?`).get(entity).n
      : 0;
  }
  return out;
}

/* ------------------------------- outbox ------------------------------- */

/** Append-only: offline sales/jobs/payments get a client UUID and UTC stamp. */
function enqueue(entity, payload, actionType = "INSERT") {
  if (!ready()) return null;
  const action = ["INSERT", "UPDATE", "DELETE"].includes(actionType) ? actionType : "INSERT";
  const clientTxnId = payload?.client_transaction_id ?? uuid();
  const row = {
    id: uuid(),
    entity,
    record_id: String(payload?.id ?? ""),
    payload: { ...payload, id: payload?.id ?? uuid(), created_at: payload?.created_at ?? nowIso() },
    created_at: nowIso(),
    status: "pending",
    attempts: 0,
    error: null,
    client_transaction_id: clientTxnId,
  };
  tx(() =>
    db
      .prepare(
        `INSERT INTO offline_sync_queue
           (id, table_name, record_id, action_type, payload_json, status, error_message,
            attempts, last_attempt_at, client_transaction_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, ?, ?)`,
      )
      .run(
        row.id,
        row.entity,
        row.record_id,
        action,
        JSON.stringify(row.payload),
        clientTxnId,
        row.created_at,
      ),
  );
  return row;
}

/** Queue rows are exposed in the legacy `{ entity, payload, error }` shape. */
const fromQueue = (r) => ({
  id: r.id,
  entity: r.table_name,
  record_id: r.record_id,
  action_type: r.action_type,
  payload: JSON.parse(r.payload_json),
  status: r.status,
  attempts: r.attempts,
  error: r.error_message,
  lastAttemptAt: r.last_attempt_at ?? null,
  clientTransactionId: r.client_transaction_id ?? null,
  quarantined: r.status === "dead_letter",
  created_at: r.created_at,
});

function pending(limit = 200) {
  if (!ready()) return [];
  return db
    .prepare(
      `SELECT * FROM offline_sync_queue WHERE status IN ('pending','failed') ORDER BY created_at LIMIT ?`,
    )
    .all(limit)
    .map(fromQueue);
}

/** Changes parked after too many refusals, for the admin retry/discard view. */
function deadLetters(limit = 200) {
  if (!ready()) return [];
  return db
    .prepare(`SELECT * FROM offline_sync_queue WHERE status = 'dead_letter' ORDER BY created_at LIMIT ?`)
    .all(limit)
    .map(fromQueue);
}

/** Put every parked change back in line. */
function retryDeadLetters() {
  if (!ready()) return 0;
  return tx(
    () =>
      db
        .prepare(
          `UPDATE offline_sync_queue SET status = 'pending', attempts = 0, error_message = NULL
             WHERE status = 'dead_letter'`,
        )
        .run().changes ?? 0,
  );
}

function discardDeadLetters() {
  if (!ready()) return 0;
  return tx(
    () => db.prepare(`DELETE FROM offline_sync_queue WHERE status = 'dead_letter'`).run().changes ?? 0,
  );
}

function pendingCounts() {
  const rows = pending(1000);
  const grouped = {};
  for (const row of rows) grouped[row.entity] = (grouped[row.entity] ?? 0) + 1;
  const parked = ready()
    ? db.prepare(`SELECT COUNT(*) AS n FROM offline_sync_queue WHERE status = 'dead_letter'`).get().n
    : 0;
  return { total: rows.length, byEntity: grouped, deadLetters: parked };
}

function markOutbox(id, status, error = null) {
  if (!ready()) return;
  tx(() => {
    if (status === "synced") {
      db.prepare(`DELETE FROM offline_sync_queue WHERE id = ?`).run(id);
      return;
    }
    // Retry state lives in the table, so it survives a restart. Past the cap
    // the change is parked rather than retried forever.
    db.prepare(
      `UPDATE offline_sync_queue
         SET attempts = attempts + 1,
             error_message = ?,
             last_attempt_at = ?,
             status = CASE WHEN attempts + 1 >= ? THEN 'dead_letter' ELSE ? END
       WHERE id = ?`,
    ).run(error, nowIso(), MAX_ATTEMPTS, status === "failed" ? "failed" : "pending", id);
  });
}

/* ---------------------------- audit ledger ---------------------------- */

function logAudit(entry) {
  if (!ready()) return null;
  const row = {
    id: uuid(),
    at: nowIso(),
    direction: entry.direction,
    entity: entry.entity,
    record_id: entry.recordId ?? null,
    records: entry.records ?? 0,
    status: entry.status,
    error: entry.error ?? null,
  };
  tx(() => {
    db.prepare(
      `INSERT INTO sync_audit (id, at, direction, entity, record_id, records, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.at, row.direction, row.entity, row.record_id, row.records, row.status, row.error);
    db.exec(
      `DELETE FROM sync_audit WHERE id NOT IN (SELECT id FROM sync_audit ORDER BY at DESC LIMIT 500)`,
    );
  });
  return row;
}

function listAudit(limit = 200) {
  if (!ready()) return [];
  return db.prepare(`SELECT * FROM sync_audit ORDER BY at DESC LIMIT ?`).all(limit);
}

/* ------------------------ compensating rollback ------------------------ */

/**
 * A queued change was discarded for good. The local copy still shows it, so
 * undo it here: the mirrored rows are removed inside one transaction and the
 * next pull re-fetches whatever the central database actually holds. Nothing
 * is left claiming a change that will never be sent.
 */
function rollbackOp(op) {
  if (!ready() || !op || !op.table) return { ok: false, removed: 0 };
  const ids = (Array.isArray(op.ids) ? op.ids : [op.ids]).map(String).filter(Boolean);
  if (!ids.length) return { ok: true, removed: 0 };
  try {
    const removed = tx(() => {
      const stmt = db.prepare(`DELETE FROM mirror WHERE entity = ? AND id = ?`);
      let n = 0;
      for (const id of ids) n += stmt.run(op.table, id).changes ?? 0;
      return n;
    });
    logAudit({
      direction: "rollback",
      entity: op.table,
      recordId: ids[0],
      records: removed,
      status: "success",
    });
    return { ok: true, removed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAudit({ direction: "rollback", entity: op.table, records: 0, status: "error", error: message });
    return { ok: false, removed: 0, error: message };
  }
}

function clearAudit() {
  if (!ready()) return;
  tx(() => db.exec(`DELETE FROM sync_audit`));
}

/* -------------------------------- misc -------------------------------- */

function getState(key) {
  if (!ready()) return null;
  return db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key)?.value ?? null;
}

function setState(key, value) {
  if (!ready()) return;
  tx(() =>
    db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value == null ? null : String(value)),
  );
}

/** Wipes the local database file. Only reachable from an admin reset. */
function getWatermark(table) {
  if (!ready()) return null;
  return (
    db.prepare(`SELECT last_synced_at FROM sync_metadata WHERE table_name = ?`).get(table)
      ?.last_synced_at ?? null
  );
}

function setWatermark(table, isoAt, { rowsPushed = 0, error = null, pushed = false } = {}) {
  if (!ready()) return;
  tx(() =>
    db
      .prepare(
        `INSERT INTO sync_metadata (table_name, last_synced_at, last_pushed_at, rows_pushed, last_error, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(table_name) DO UPDATE SET
           last_synced_at = COALESCE(excluded.last_synced_at, sync_metadata.last_synced_at),
           last_pushed_at = COALESCE(excluded.last_pushed_at, sync_metadata.last_pushed_at),
           rows_pushed = sync_metadata.rows_pushed + excluded.rows_pushed,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(
        table,
        isoAt ?? null,
        pushed ? new Date().toISOString() : null,
        rowsPushed,
        error ? String(error).slice(0, 3000) : null,
        new Date().toISOString(),
      ),
  );
}

function erase() {
  try {
    if (db) {
      db.close();
      db = null;
    }
    fs.rmSync(dbPath, { force: true });
    // Remove any file written by a pre-1.3.1 build that still had a JSON store.
    fs.rmSync(String(dbPath).replace(/\.db$/, ".json"), { force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function info() {
  return {
    engine: db ? "sqlite" : "none",
    path: dbPath,
    ready: ready(),
    ...(lastError ? { error: lastError } : {}),
  };
}

module.exports = {
  MIRROR_ENTITIES,
  init,
  info,
  mirror,
  listMirror,
  counts,
  enqueue,
  pending,
  pendingCounts,
  markOutbox,
  logAudit,
  listAudit,
  clearAudit,
  rollbackOp,
  getState,
  setState,
  getWatermark,
  setWatermark,
  erase,
};
