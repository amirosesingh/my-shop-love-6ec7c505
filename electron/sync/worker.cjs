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

const BATCH = 200;
const INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 5;

let supabase = null;
let enabled = true;
let timer = null;
let running = false;
let notify = () => {};
const attempts = new Map(); // `${table}:${id}` -> failed attempts
let credentials = {};

function init({ url, key, accessToken, cashierToken, terminalTokenId, branchId, onChange }) {
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
  credentials = { cashierToken, terminalTokenId, branchId };
  if (onChange) notify = onChange;
}

async function cloudRequest(table, method, body) {
  const headers = {
    "Content-Type": "application/json",
    apikey: supabase.supabaseKey,
    ...(credentials.cashierToken ? { "x-cashier-session": credentials.cashierToken } : {}),
    ...(credentials.terminalTokenId ? { "x-terminal-token-id": credentials.terminalTokenId } : {}),
    ...(credentials.branchId ? { "x-branch-id": credentials.branchId } : {}),
  };
  const response = await fetch(`${supabase.supabaseUrl}/rest/v1/${table}${method === "GET" ? "?select=*" : ""}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error((await response.text()) || `Cloud ${method} failed (${response.status})`);
  return response.status === 204 ? [] : response.json();
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
  let pushed = 0;
  let failed = 0;
  for (const table of repo.TABLES) {
    let rows;
    try {
      rows = await repo.pendingRows(table, BATCH);
    } catch (err) {
      return { ok: false, pushed, failed, error: err.message };
    }
    if (!rows.length) continue;

    const ids = rows.map((r) => r.id);
    const payload = rows.map((r) => repo.toCloudRow(table, r));
    let error = null;
    try {
      await cloudRequest(table, "POST", payload);
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
      continue;
    }

    await repo.markSynced(table, ids);
    for (const id of ids) attempts.delete(`${table}:${id}`);
    pushed += ids.length;
  }
  if (pushed) await repo.setState("last_push_at", new Date().toISOString());
  notify();
  return { ok: failed === 0, pushed, failed };
}

async function pull() {
  if (!supabase) return { ok: false, merged: 0, error: "Cloud client not ready" };
  const since = (await repo.getState("last_pull_at")) ?? "1970-01-01T00:00:00.000Z";
  let merged = 0;
  for (const table of repo.CATALOGUE_TABLES) {
    // Delta only: anything the cloud has touched since our last clean pull.
    let { data, error } = await supabase.from(table).select("*").gt("updated_at", since);
    // Not every table carries updated_at; those fall back to creation time.
    if (error) ({ data, error } = await supabase.from(table).select("*").gt("created_at", since));
    if (error) return { ok: false, merged, error: error.message };
    merged += await repo.mergeFromCloud(table, data ?? []);
  }
  // Settings is a single wide row; fetch it whole.
  const { data: settings } = await supabase.from("pos_settings").select("*").maybeSingle();
  if (settings) {
    await repo.mergeFromCloud("pos_settings", [{ ...settings, id: repo.SETTINGS_ID }]);
    merged += 1;
  }
  await repo.setState("last_pull_at", new Date().toISOString());
  notify();
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
      tables: await repo.stats(),
      lastPushAt: await repo.getState("last_push_at"),
      lastPullAt: await repo.getState("last_pull_at"),
    };
  } catch (err) {
    return { connected: false, error: err.message, tables: [], lastPushAt: null, lastPullAt: null };
  }
}

module.exports = { init, start, stop, setEnabled, push, pull, run, status };