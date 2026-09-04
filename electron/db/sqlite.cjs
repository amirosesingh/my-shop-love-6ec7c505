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
  "stock_count_drafts",
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
  "shift_sessions",
  "drawer_events",
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
    stampSchemaVersion();
    
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
const TOMBSTONE_TABLES = [
  "products",
  "product_categories",
  "product_barcodes",
  "uom_units",
  "suppliers",
  "promotions",
  "membership_tiers",
  "stores",
  "members",
];

/**
 * The shape this build expects. It is written into the file only after the
 * upgrade has finished, so a machine switched off part-way through still
 * reports the older number next time and simply runs the upgrade again. Every
 * step is an additive column check inside the existing tables, so sales,
 * stock, shifts, the queued rows waiting to be sent and the terminal's own
 * settings are never rebuilt or cleared.
 */
const SCHEMA_VERSION = 6;

/** What the file on disk says it is. 0 for a database from before versioning. */
function schemaVersion() {
  try {
    return Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  } catch {
    return 0;
  }
}

function stampSchemaVersion() {
  try {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } catch {
    /* an older engine without the pragma still runs the additive upgrade */
  }
}

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
    add("sync_attempts", "INTEGER NOT NULL DEFAULT 0");
    add("sync_error", "TEXT");
    add("last_error_at", "TEXT");
    add("synced_at", "TEXT");
    if (!have.has("updated_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`);
  }

  // 2. Idempotency key on the transaction tables.
  for (const table of ["sales", "sale_items", "payment_transactions", "item_activity_logs"]) {
    if (!columnsOf(table).size) continue;
    if (!columnsOf(table).has("client_transaction_id")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN client_transaction_id TEXT`);
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_client_txn_idx
         ON ${table} (client_transaction_id) WHERE client_transaction_id IS NOT NULL`,
    );
  }

  // Columns introduced with the split-payment and stock-ledger sync paths.
  const payment = columnsOf("payment_transactions");
  if (payment.size) {
    if (!payment.has("cashier_id")) db.exec("ALTER TABLE payment_transactions ADD COLUMN cashier_id TEXT");
    if (!payment.has("status")) db.exec("ALTER TABLE payment_transactions ADD COLUMN status TEXT DEFAULT 'completed'");
    if (!payment.has("metadata")) db.exec("ALTER TABLE payment_transactions ADD COLUMN metadata TEXT DEFAULT '{}'");
  }
  const activity = columnsOf("item_activity_logs");
  if (activity.size) {
    if (!activity.has("staff_id")) db.exec("ALTER TABLE item_activity_logs ADD COLUMN staff_id TEXT");
    if (!activity.has("role")) db.exec("ALTER TABLE item_activity_logs ADD COLUMN role TEXT");
  }

  // Tombstones: head office stamps a deletion rather than erasing the row, so
  // the till can learn about it on the next pull and drop its own copy.
  for (const table of TOMBSTONE_TABLES) {
    if (!columnsOf(table).size) continue;
    if (!columnsOf(table).has("deleted_at")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    }
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

/** Reported to the diagnostics screen so a stalled upgrade is visible. */
function schemaState() {
  return { version: schemaVersion(), expected: SCHEMA_VERSION, upToDate: schemaVersion() === SCHEMA_VERSION };
}

/** Called by the shell once the branch and till are known. */
function setScope({ storeId, terminalId } = {}) {
  scope = { storeId: storeId ? String(storeId) : "", terminalId: terminalId ? String(terminalId) : "" };
  return scope;
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

/* ------------------------- staff (offline login) ------------------------- */

/**
 * The roster mirrored from the central database, so a till with no connection
 * can still show who works at this branch and check a PIN.
 *
 * The central database hashes PINs with bcrypt inside Postgres, which cannot
 * be recomputed here, so the mirrored row carries no usable hash. Instead the
 * till writes a PBKDF2 verifier of the PIN the first time that person signs in
 * successfully online (`setStaffVerifier`), and that verifier is what an
 * offline sign-in is checked against.
 */
function upsertStaffRoster(rows) {
  if (!ready() || !Array.isArray(rows) || !rows.length) return 0;
  const at = nowIso();
  return tx(() => {
    const stmt = db.prepare(
      `INSERT INTO app_users
         (id, user_id, full_name, email, role, role_slug, store_id, is_active,
          permissions, pin_length, is_synced, sync_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'synced', ?)
       ON CONFLICT(user_id) DO UPDATE SET
         full_name = excluded.full_name,
         email = excluded.email,
         role = excluded.role,
         role_slug = excluded.role_slug,
         store_id = excluded.store_id,
         is_active = excluded.is_active,
         permissions = excluded.permissions,
         pin_length = COALESCE(excluded.pin_length, app_users.pin_length),
         updated_at = excluded.updated_at`,
    );
    let n = 0;
    for (const row of rows) {
      const userId = String(row?.user_id ?? row?.username ?? "").trim().toLowerCase();
      if (!userId) continue;
      stmt.run(
        String(row?.id ?? uuid()),
        userId,
        row?.full_name ?? row?.fullName ?? userId,
        row?.email ?? null,
        row?.role ?? null,
        row?.role_slug ?? row?.roleSlug ?? null,
        row?.store_id ?? row?.storeId ?? null,
        row?.is_active === false ? 0 : 1,
        JSON.stringify(row?.permissions ?? {}),
        Number(row?.pin_length ?? row?.pinLength) || null,
        at,
      );
      n += 1;
    }
    return n;
  });
}

const parseStaff = (row) =>
  row
    ? {
        id: row.id,
        username: row.user_id,
        fullName: row.full_name || row.user_id,
        email: row.email ?? "",
        roleSlug: row.role_slug ?? row.role ?? "cashier",
        storeId: row.store_id ?? null,
        isActive: row.is_active !== 0,
        pinLength: row.pin_length ?? 0,
        verifier: row.pin_hash ?? "",
        permissions: (() => {
          try {
            return JSON.parse(row.permissions ?? "{}");
          } catch {
            return {};
          }
        })(),
      }
    : null;

/** Everyone this till can offer at sign-in; optionally limited to one branch. */
function listStaffRoster(storeId) {
  if (!ready()) return [];
  const rows = storeId
    ? db
        .prepare(
          `SELECT * FROM app_users WHERE is_active = 1 AND (store_id = ? OR store_id IS NULL)
             ORDER BY full_name`,
        )
        .all(String(storeId))
    : db.prepare(`SELECT * FROM app_users WHERE is_active = 1 ORDER BY full_name`).all();
  return rows.map(parseStaff);
}

function getStaff(username) {
  if (!ready()) return null;
  const key = String(username ?? "").trim().toLowerCase();
  if (!key) return null;
  return parseStaff(
    db
      .prepare(`SELECT * FROM app_users WHERE lower(user_id) = ? OR lower(email) = ? LIMIT 1`)
      .get(key, key),
  );
}

/** Remember a PBKDF2 verifier for a person who just signed in online. */
function setStaffVerifier(username, verifier, pinLength) {
  if (!ready()) return false;
  const key = String(username ?? "").trim().toLowerCase();
  if (!key || !verifier) return false;
  return tx(() => {
    const existing = db.prepare(`SELECT id FROM app_users WHERE lower(user_id) = ?`).get(key);
    if (existing) {
      db.prepare(
        `UPDATE app_users SET pin_hash = ?, pin_length = COALESCE(?, pin_length),
           last_login_at = ?, updated_at = ? WHERE id = ?`,
      ).run(verifier, Number(pinLength) || null, nowIso(), nowIso(), existing.id);
    } else {
      db.prepare(
        `INSERT INTO app_users (id, user_id, full_name, is_active, permissions, pin_hash,
           pin_length, last_login_at, updated_at)
         VALUES (?, ?, ?, 1, '{}', ?, ?, ?, ?)`,
      ).run(uuid(), key, key, verifier, Number(pinLength) || null, nowIso(), nowIso());
    }
    return true;
  });
}

/** Wipe on demand — an admin removing a person must remove their offline key. */
function forgetStaffVerifier(username) {
  if (!ready()) return false;
  const key = String(username ?? "").trim().toLowerCase();
  return tx(() => {
    db.prepare(`UPDATE app_users SET pin_hash = NULL WHERE lower(user_id) = ?`).run(key);
    return true;
  });
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
    db
      .prepare(
        `SELECT last_synced_at FROM sync_metadata
           WHERE table_name = ? AND store_id = ? AND terminal_id = ?`,
      )
      .get(table, scope.storeId, scope.terminalId)?.last_synced_at ?? null
  );
}

function setWatermark(table, isoAt, { rowsPushed = 0, error = null, pushed = false } = {}) {
  if (!ready()) return;
  tx(() =>
    db
      .prepare(
        `INSERT INTO sync_metadata
           (table_name, store_id, terminal_id, last_synced_at, last_pushed_at, rows_pushed, last_error, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(table_name, store_id, terminal_id) DO UPDATE SET
           last_synced_at = COALESCE(excluded.last_synced_at, sync_metadata.last_synced_at),
           last_pushed_at = COALESCE(excluded.last_pushed_at, sync_metadata.last_pushed_at),
           rows_pushed = sync_metadata.rows_pushed + excluded.rows_pushed,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(
        table,
        scope.storeId,
        scope.terminalId,
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

/**
 * The same relationship picture the cloud RPC returns, derived from the local
 * mirror's own catalogue so the health screen still answers when the terminal
 * is offline. Read-only: table counts, declared foreign keys, orphan counts.
 */
function relationalHealth() {
  if (!db) return { at: new Date().toISOString(), tables: [], error: "The local database is not open." };
  const tables = [];
  for (const entity of MIRROR_ENTITIES) {
    let rows = 0;
    try {
      rows = Number(db.prepare(`SELECT count(*) AS n FROM ${entity}`).get()?.n ?? 0);
    } catch {
      continue; // this mirror table does not exist locally
    }
    const links = [];
    let fks = [];
    try {
      fks = db.prepare(`PRAGMA foreign_key_list(${entity})`).all();
    } catch {
      fks = [];
    }
    for (const fk of fks) {
      const child = fk.from;
      const parent = fk.table;
      const parentColumn = fk.to || "id";
      let orphans = 0;
      try {
        orphans = Number(
          db
            .prepare(
              `SELECT count(*) AS n FROM ${entity} ch WHERE ch.${child} IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM ${parent} pa WHERE pa.${parentColumn} = ch.${child})`,
            )
            .get()?.n ?? 0,
        );
      } catch {
        orphans = 0;
      }
      links.push({ column: child, parent_table: parent, parent_column: parentColumn, orphans });
    }
    tables.push({ table: entity, rows, links });
  }
  return { at: new Date().toISOString(), tables };
}

module.exports = {
  schemaState,
  schemaVersion,
  SCHEMA_VERSION,
  upsertStaffRoster,
  listStaffRoster,
  getStaff,
  setStaffVerifier,
  forgetStaffVerifier,
  MIRROR_ENTITIES,
  init,
  info,
  relationalHealth,
  setScope,
  mirror,
  listMirror,
  counts,
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
