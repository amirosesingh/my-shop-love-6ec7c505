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
  const row = {
    id: uuid(),
    entity,
    record_id: String(payload?.id ?? ""),
    payload: { ...payload, id: payload?.id ?? uuid(), created_at: payload?.created_at ?? nowIso() },
    created_at: nowIso(),
    status: "pending",
    attempts: 0,
    error: null,
  };
  tx(() =>
    db
      .prepare(
        `INSERT INTO offline_sync_queue
           (id, table_name, record_id, action_type, payload_json, status, error_message, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, ?)`,
      )
      .run(
        row.id,
        row.entity,
        row.record_id,
        actionType === "UPDATE" ? "UPDATE" : "INSERT",
        JSON.stringify(row.payload),
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

function pendingCounts() {
  const rows = pending(1000);
  const grouped = {};
  for (const row of rows) grouped[row.entity] = (grouped[row.entity] ?? 0) + 1;
  return { total: rows.length, byEntity: grouped };
}

function markOutbox(id, status, error = null) {
  if (!ready()) return;
  tx(() => {
    if (status === "synced") {
      db.prepare(`DELETE FROM offline_sync_queue WHERE id = ?`).run(id);
      return;
    }
    db.prepare(
      `UPDATE offline_sync_queue
         SET status = ?, error_message = ?, attempts = attempts + 1
       WHERE id = ?`,
    ).run(status === "failed" ? "failed" : "pending", error, id);
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
  getState,
  setState,
  erase,
};
