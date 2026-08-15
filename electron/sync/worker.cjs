/**
 * Background sync worker.
 *
 * Push: local rows with is_synced = 0 are batch-upserted into the cloud, in
 * dependency order, then flagged as synced.
 * Pull: catalogue tables only, merged into the local database. Transactional
 * tables are never pulled, so a cloud read can't overwrite an offline sale.
 */
const { createClient } = require("@supabase/supabase-js");
const repo = require("../db/repo.cjs");

const BATCH = 50;
const INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 5;

let supabase = null;
let enabled = true;
let timer = null;
let running = false;
let notify = () => {};
let phase = "idle";

function setPhase(next) {
  phase = next;
  notify();
}
const attempts = new Map(); // `${table}:${id}` -> failed attempts
let credentials = {};
let relayUrl = null;
// Which timestamp column each catalogue table actually has. Probed once so a
// table without updated_at doesn't fire a failing request on every pull.
const stampColumn = new Map();

async function selectChangedSince(table, since) {
  const ask = (column) => supabase.from(table).select("*").gt(column, since);
  const known = stampColumn.get(table);
  if (known) return await ask(known);
  let res = await ask("updated_at");
  if (!res.error) {
    stampColumn.set(table, "updated_at");
    return res;
  }
  res = await ask("created_at");
  if (!res.error) stampColumn.set(table, "created_at");
  return res;
}

/**
 * Stock never travels as an absolute figure. A till pushes its movement rows
 * and the central database applies each one as a relative delta, keyed on the
 * movement id so a retry can never deduct twice.
 */
const STOCK_OWNED_COLUMNS = ["stock_by_store", "stock_quantity"];

function stripAbsoluteStock(table, rows) {
  if (table !== "products") return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const column of STOCK_OWNED_COLUMNS) delete copy[column];
    return copy;
  });
}

async function applyStockDeltas(rows) {
  let failure = null;
  for (const row of rows) {
    const delta = Number(row.quantity_delta ?? 0);
    if (!row.id || !row.product_id || !delta) continue;
    const { error } = await supabase.rpc("stock_apply_delta", {
      _movement_id: row.id,
      _product_id: row.product_id,
      _store_id: row.store_id ?? credentials.branchId ?? null,
      _delta: Math.trunc(delta),
    });
    if (error) failure = error.message;
  }
  return failure;
}

function init({ url, key, accessToken, sessionToken, cashierToken, terminalToken, branchId, relayUrl: relay, onChange }) {
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
  credentials = { accessToken, sessionToken, cashierToken, terminalToken, branchId };
  // Watermarks are per branch and per till, so one machine moved between
  // branches never resumes another branch's position.
  if (typeof repo.setScope === "function") {
    repo.setScope({ storeId: branchId, terminalId: credentials.terminalToken ?? "" });
  }
  relayUrl = relay || null;
  if (onChange) notify = onChange;
}

async function cloudUpsert(table, rows) {
  const bearer = credentials.sessionToken || credentials.accessToken;
  if (relayUrl && (bearer || credentials.cashierToken || credentials.terminalToken)) {
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({
        sessionToken: credentials.sessionToken,
        cashierToken: credentials.cashierToken,
        terminalToken: credentials.terminalToken,
        ops: [{ kind: "upsert", table, rows, onConflict: "id" }],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || body.results?.some((result) => !result.ok)) {
      throw new Error(body?.error || body?.results?.find((result) => !result.ok)?.error || `Sync relay failed (${response.status})`);
    }
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

function setEnabled(on) {
  enabled = !!on;
  notify();
  if (enabled) void run();
}

function start() {
  if (timer) return;
  timer = setInterval(() => void run(), INTERVAL_MS);
  void run();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function reachable() {
  try {
    const res = await fetch(`${supabase.supabaseUrl}/auth/v1/health`, { method: "GET" });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function push() {
  if (!supabase) return { ok: false, pushed: 0, failed: 0, error: "Cloud client not ready" };
  setPhase("pushing");
  let pushed = 0;
  let failed = 0;
  for (const table of repo.TABLES) {
    let rows;
    try {
      rows = await repo.pendingRows(table, BATCH);
    } catch (err) {
      setPhase("idle");
      return { ok: false, pushed, failed, error: err.message };
    }
    if (!rows.length) continue;

    const ids = rows.map((r) => r.id);
    const payload = stripAbsoluteStock(
      table,
      rows.map((r) => repo.toCloudRow(table, r)),
    );
    let error = null;
    try {
      await cloudUpsert(table, payload);
    } catch (err) {
      error = err;
    }

    if (error) {
      failed += ids.length;
      let quarantine = false;
      for (const id of ids) {
        const key = `${table}:${id}`;
        const n = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, n);
        if (n >= MAX_ATTEMPTS) quarantine = true;
      }
      await repo.markFailed(table, ids, error.message, quarantine);
      await repo
        .setWatermark(table, null, { error: error.message })
        .catch(() => {});
      notify();
      continue;
    }

    // Inventory moves only after the movement rows themselves are up.
    let deltaError = null;
    if (table === "item_activity_logs") deltaError = await applyStockDeltas(payload);

    await repo.markSynced(table, ids);
    for (const id of ids) attempts.delete(`${table}:${id}`);
    pushed += ids.length;
    await repo
      .setWatermark(table, null, { rowsPushed: ids.length, pushed: true, error: deltaError })
      .catch(() => {});
    notify();
  }
  if (pushed) await repo.setState("last_push_at", new Date().toISOString());
  setPhase("idle");
  return { ok: failed === 0, pushed, failed };
}

async function pull() {
  if (!supabase) return { ok: false, merged: 0, error: "Cloud client not ready" };
  setPhase("pulling");
  const fallback = (await repo.getState("last_pull_at")) ?? "1970-01-01T00:00:00.000Z";
  let merged = 0;
  for (const table of repo.CATALOGUE_TABLES) {
    // Per-table high-water mark: one slow table never holds the others back.
    let since = fallback;
    try {
      since = (await repo.getWatermark(table)) ?? fallback;
    } catch {
      /* pre-1.3.3 database without sync_metadata */
    }
    const startedAt = new Date().toISOString();
    // Delta only: anything the cloud has touched since our last clean pull.
    const { data, error } = await selectChangedSince(table, since);
    if (error) {
      await repo.setWatermark(table, null, { error: error.message }).catch(() => {});
      setPhase("idle");
      return { ok: false, merged, error: error.message };
    }
    merged += await repo.mergeFromCloud(table, data ?? []);
    // Watermark advances only after a clean merge.
    await repo.setWatermark(table, startedAt, { error: null }).catch(() => {});
  }
  // Settings is a single wide row; fetch it whole.
  const { data: settings } = await supabase.from("pos_settings").select("*").maybeSingle();
  if (settings) {
    await repo.mergeFromCloud("pos_settings", [{ ...settings, id: repo.SETTINGS_ID }]);
    merged += 1;
  }
  await repo.setState("last_pull_at", new Date().toISOString());
  setPhase("idle");
  return { ok: true, merged };
}

async function run() {
  if (running || !enabled || !supabase) return;
  running = true;
  try {
    if (!(await reachable())) return;
    await push();
    await pull();
  } catch {
    /* next tick retries */
  } finally {
    running = false;
  }
}

async function status() {
  try {
    return {
      connected: true,
      phase,
      enabled,
      tables: await repo.stats(),
      queue: await repo.queueRows(60),
      lastPushAt: await repo.getState("last_push_at"),
      lastPullAt: await repo.getState("last_pull_at"),
    };
  } catch (err) {
    return {
      connected: false,
      phase,
      enabled,
      error: err.message,
      tables: [],
      queue: [],
      lastPushAt: null,
      lastPullAt: null,
    };
  }
}

module.exports = { init, start, stop, setEnabled, push, pull, run, status };