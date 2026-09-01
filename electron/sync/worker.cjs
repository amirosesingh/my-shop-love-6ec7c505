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
let credentials = {};
let relayUrl = null;
// Which timestamp column each catalogue table actually has. Probed once so a
// table without updated_at doesn't fire a failing request on every pull.
const stampColumn = new Map();

/**
 * The central database rejecting a table because it (or a column) does not
 * exist there. PostgREST answers PGRST205/204 or a 404 schema-cache message.
 */
const MISSING_CLOUD_RE =
  /PGRST20[45]|schema cache|does not exist|could not find the table|not found in the schema/i;

/** A deployed app/relay mismatch is configuration drift, never a bad row. */
const UNSUPPORTED_RELAY_TABLE_RE = /["']?[a-z_]+["']? cannot be synced/i;

/**
 * Tables the central project has not grown yet, with the earliest moment we
 * re-probe. Instead of failing the same batch every 30 seconds, the table is
 * skipped and the Sync Hub shows exactly what is missing; the push resumes by
 * itself once the table exists centrally.
 */
const cloudMissing = new Map(); // table -> retry-after epoch ms
const CLOUD_MISSING_RETRY_MS = 10 * 60 * 1000;

/**
 * The central project rejecting our credentials (HTTP 401/403, "Invalid API
 * key", a bad JWT). This is never a row fault: every queued row keeps its
 * place, all cloud traffic parks silently, and the Sync Hub points at
 * Settings → Database & Cloud Connection. Saving fresh keys re-inits the
 * worker, which clears the flag.
 */
let credentialsInvalid = false;
const CREDENTIAL_ERROR_RE =
  /invalid api ?key|bad jwt|jwt expired|invalid token|unauthorized|not recognised|forbidden/i;

function isCredentialError(err) {
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (status === 401 || status === 403) return true;
  const msg = String(err?.message ?? err ?? "");
  // A bare HTTP 400/401/403 embedded in a relay error message counts too.
  return CREDENTIAL_ERROR_RE.test(msg) || /\((401|403)\)/.test(msg);
}

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
 * Same delta read, but limited to rows this branch is allowed to see: either a
 * store column matches our branch, or the row hangs off a parent we just
 * pulled.
 */
async function selectScoped(spec, since, storeId, parentIds) {
  const stamp = stampColumn.get(spec.table);
  const build = (column) => {
    let query = supabase.from(spec.table).select("*").gt(column, since);
    if (spec.storeColumns?.length === 1) query = query.eq(spec.storeColumns[0], storeId);
    else if (spec.storeColumns?.length) {
      query = query.or(spec.storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
    }
    if (spec.parent) query = query.in(spec.parent.column, parentIds ?? []);
    return query;
  };
  if (stamp) return await build(stamp);
  let res = await build("updated_at");
  if (!res.error) {
    stampColumn.set(spec.table, "updated_at");
    return res;
  }
  res = await build("created_at");
  if (!res.error) stampColumn.set(spec.table, "created_at");
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
  const movements = [];
  const seen = new Set();
  for (const row of rows) {
    const delta = Number(row.quantity_delta ?? 0);
    if (!row.id || !row.product_id || !delta || seen.has(row.id)) continue;
    seen.add(row.id);
    movements.push({
      movement_id: row.id,
      product_id: row.product_id,
      store_id: row.store_id ?? credentials.branchId ?? null,
      delta: Math.trunc(delta),
    });
  }
  if (!movements.length) return null;

  // One round trip for the whole push batch; each movement is still applied
  // once, keyed on its own id. Refusals come back per movement so the exact
  // rows can be parked with their reason instead of vanishing as "synced".
  const asRefusals = (rows) =>
    (rows ?? [])
      .filter((r) => r?.status === "refused")
      .map((r) => ({
        id: String(r.movement_id ?? "").toLowerCase(),
        reason: r.reason ?? "refused",
      }))
      .filter((r) => r.id);

  const { data, error } = await supabase.rpc("stock_apply_deltas", { _movements: movements });
  if (!error) {
    const refused = asRefusals(data);
    return refused.length
      ? { error: `${refused.length} stock movement(s) refused: ${refused[0].reason}`, refused }
      : null;
  }
  // Older central database without the batch routine: fall back per movement.
  if (!/does not exist|not find|schema cache|PGRST202/i.test(error.message || "")) {
    return { error: error.message, refused: [] };
  }
  const refused = [];
  let failure = null;
  for (const m of movements) {
    const res = await supabase.rpc("stock_apply_delta", {
      _movement_id: m.movement_id,
      _product_id: m.product_id,
      _store_id: m.store_id,
      _delta: m.delta,
    });
    if (res.error) {
      failure = res.error.message;
      continue;
    }
    const rows2 = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
    refused.push(...asRefusals(rows2));
  }
  if (refused.length) {
    return { error: `${refused.length} stock movement(s) refused: ${refused[0].reason}`, refused };
  }
  return failure ? { error: failure, refused: [] } : null;
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
  // Fresh credentials (re)saved: any earlier rejection no longer applies.
  credentialsInvalid = false;
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
  for (const table of repo.PUSH_TABLES ?? repo.TABLES) {
    const retryAt = cloudMissing.get(table);
    if (retryAt && Date.now() < retryAt) continue; // parked: central schema missing
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
      cloudMissing.delete(table); // the central schema caught up
    } catch (err) {
      error = err;
    }

    if (error) {
      if (isCredentialError(error)) {
        // Keys rejected: leave every row queued untouched and park the worker.
        credentialsInvalid = true;
        await repo
          .setWatermark(table, null, {
            error: "Cloud credentials rejected — update them in Settings → Database & Cloud Connection.",
          })
          .catch(() => {});
        setPhase("idle");
        notify();
        return { ok: false, pushed, failed, error: "credentials" };
      }
      failed += ids.length;
      if (UNSUPPORTED_RELAY_TABLE_RE.test(String(error.message ?? ""))) {
        cloudMissing.set(table, Date.now() + CLOUD_MISSING_RETRY_MS);
        const message =
          `This app version cannot relay "${table}". Update the POS/central app, then use Retry all parked rows. (${error.message})`;
        await repo.markFailed(table, ids, message, 2_147_483_647).catch(() => {});
        await repo.setWatermark(table, null, { error: message }).catch(() => {});
        notify();
        continue;
      }
      if (MISSING_CLOUD_RE.test(String(error.message ?? ""))) {
        // Central drift is not a row fault: park with a clear pointer and
        // leave the attempt counter untouched so the rows resume cleanly.
        cloudMissing.set(table, Date.now() + CLOUD_MISSING_RETRY_MS);
        await repo
          .markFailed(
            table,
            ids,
            `Table "${table}" is missing or out of date in the central database — open Settings → Central schema, download the repair SQL and run it once in the central project. (${error.message})`,
            2_147_483_647,
          )
          .catch(() => {});
        await repo
          .setWatermark(table, null, {
            error: `central schema missing: ${table} (see Settings → Central schema)`,
          })
          .catch(() => {});
        notify();
        continue;
      }
      // The attempt counter lives in the database: a parked row stays parked
      // across restarts until someone retries it from the Sync Hub.
      await repo.markFailed(table, ids, error.message, MAX_ATTEMPTS);
      await repo
        .setWatermark(table, null, { error: error.message })
        .catch(() => {});
      notify();
      continue;
    }

    // Inventory moves only after the movement rows themselves are up. A
    // refusal (e.g. the central negative-stock guard) is not "synced": the
    // movement row keeps its place in the queue with the reason attached, so
    // the Sync Hub shows it and a later retry can still apply it.
    let deltaError = null;
    let syncedIds = ids;
    if (table === "item_activity_logs") {
      const result = await applyStockDeltas(payload);
      if (result) {
        deltaError = result.error;
        if (result.refused?.length) {
          const refusedIds = new Set(result.refused.map((r) => r.id));
          const parked = ids.filter((id) => refusedIds.has(String(id).toLowerCase()));
          if (parked.length) {
            await repo.markFailed(
              table,
              parked,
              `Stock movement refused centrally: ${result.refused[0].reason ?? "guard"}`,
              MAX_ATTEMPTS,
            );
            syncedIds = ids.filter((id) => !refusedIds.has(String(id).toLowerCase()));
            failed += parked.length;
          }
        }
      }
    }

    await repo.markSynced(table, syncedIds);
    pushed += syncedIds.length;
    await repo
      .setWatermark(table, null, { rowsPushed: syncedIds.length, pushed: true, error: deltaError })
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
  const markFor = async (table) => {
    try {
      return (await repo.getWatermark(table)) ?? fallback;
    } catch {
      return fallback; // pre-1.3.3 database without sync_metadata
    }
  };
  for (const table of repo.CATALOGUE_TABLES) {
    // Per-table high-water mark: one slow table never holds the others back.
    const since = await markFor(table);
    const startedAt = new Date().toISOString();
    // Delta only: anything the cloud has touched since our last clean pull.
    const { data, error } = await selectChangedSince(table, since);
    if (error) {
      if (isCredentialError(error)) {
        credentialsInvalid = true;
        await repo
          .setWatermark(table, null, {
            error: "Cloud credentials rejected — update them in Settings → Database & Cloud Connection.",
          })
          .catch(() => {});
        setPhase("idle");
        notify();
        return { ok: false, merged, error: "credentials" };
      }
      await repo.setWatermark(table, null, { error: error.message }).catch(() => {});
      if (MISSING_CLOUD_RE.test(String(error.message ?? ""))) {
        // A table the central project has not grown yet is skipped, not fatal.
        cloudMissing.set(table, Date.now() + CLOUD_MISSING_RETRY_MS);
        notify();
        continue;
      }
      setPhase("idle");
      return { ok: false, merged, error: error.message };
    }
    merged += await repo.mergeFromCloud(table, data ?? []);
    // Watermark advances only after a clean merge.
    await repo.setWatermark(table, startedAt, { error: null }).catch(() => {});
  }

  // Work done elsewhere that this branch still needs: members, plus transfers
  // and bookings that belong to us. Parents come first so their children can
  // be fetched by id.
  const parentIds = new Map();
  for (const spec of repo.SCOPED_PULL_TABLES ?? []) {
    const storeId = credentials.branchId ? String(credentials.branchId) : "";
    if (spec.storeColumns && !storeId) continue; // unpinned till: stay out of other branches
    let ids = null;
    if (spec.parent) {
      ids = parentIds.get(spec.parent.table) ?? [];
      if (!ids.length) continue; // nothing new upstream this cycle
    }
    const since = await markFor(spec.table);
    const startedAt = new Date().toISOString();
    const { data, error } = await selectScoped(spec, since, storeId, ids);
    if (error) {
      // A branch-scoped table must never block catalogue sync.
      await repo.setWatermark(spec.table, null, { error: error.message }).catch(() => {});
      if (MISSING_CLOUD_RE.test(String(error.message ?? ""))) {
        cloudMissing.set(spec.table, Date.now() + CLOUD_MISSING_RETRY_MS);
        notify();
      }
      continue;
    }
    const rows = data ?? [];
    if (!spec.parent) parentIds.set(spec.table, rows.map((row) => row.id).filter(Boolean));
    try {
      merged += await repo.mergeFromCloud(spec.table, rows);
      await repo.setWatermark(spec.table, startedAt, { error: null }).catch(() => {});
    } catch (err) {
      await repo.setWatermark(spec.table, null, { error: String(err) }).catch(() => {});
    }
  }

  // Settings is a single wide row, so we only re-read it once it changed.
  const settingsSince = await markFor("pos_settings");
  const settingsStartedAt = new Date().toISOString();
  const { data: settings, error: settingsError } = await supabase
    .from("pos_settings")
    .select("*")
    .gt("updated_at", settingsSince)
    .maybeSingle();
  if (settings && !settingsError) {
    await repo.mergeFromCloud("pos_settings", [{ ...settings, id: repo.SETTINGS_ID }]);
    merged += 1;
  }
  if (!settingsError) {
    await repo.setWatermark("pos_settings", settingsStartedAt, { error: null }).catch(() => {});
  }
  await repo.setState("last_pull_at", new Date().toISOString());
  setPhase("idle");
  return { ok: true, merged };
}

/* ------------------------------------------------------------------ *
 * Transactional restore — explicit, never on the timer.
 * ------------------------------------------------------------------ */

const RESTORE_PAGE = 1000;
let restoreState = null;

function restoreStatus() {
  return restoreState;
}

/** One page-by-page read of a restore table, store-scoped and date-windowed. */
async function readRestorePage(spec, storeId, sinceIso, parentIds, from) {
  let query = supabase.from(spec.table).select("*").range(from, from + RESTORE_PAGE - 1);
  if (spec.storeColumns?.length === 1) query = query.eq(spec.storeColumns[0], storeId);
  else if (spec.storeColumns?.length) {
    query = query.or(spec.storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
  }
  if (spec.dateColumn && sinceIso) query = query.gte(spec.dateColumn, sinceIso);
  if (spec.parent) query = query.in(spec.parent.column, parentIds ?? []);
  return await query;
}

/**
 * Pull this branch's trading history back down after a wipe or a new install.
 *
 * Runs only when an operator asks for it. Rows this till still owes the cloud
 * are left alone (see repo.restoreMerge), so a restore can never destroy work
 * that has not been pushed yet.
 */
async function restore({ days = 90 } = {}) {
  if (!supabase) return { ok: false, error: "Cloud client not ready" };
  if (restoreState?.running) return { ok: false, error: "A restore is already running" };
  const storeId = credentials.branchId ? String(credentials.branchId) : "";
  if (!storeId) {
    return { ok: false, error: "This till is not pinned to a branch — set the branch before restoring." };
  }
  const specs = repo.RESTORE_TABLES ?? [];
  const sinceIso = new Date(Date.now() - Math.max(1, Number(days) || 90) * 86_400_000).toISOString();
  restoreState = {
    running: true,
    table: null,
    index: 0,
    total: specs.length,
    restored: 0,
    skipped: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    tables: [],
  };
  notify();

  const parentIds = new Map();
  try {
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      restoreState.index = i + 1;
      restoreState.table = spec.table;
      notify();
      let ids = null;
      if (spec.parent) {
        ids = parentIds.get(spec.parent.table) ?? [];
        if (!ids.length) {
          restoreState.tables.push({ table: spec.table, restored: 0, skipped: 0 });
          continue;
        }
      }
      let restored = 0;
      let skipped = 0;
      const collected = [];
      // Children are fetched per chunk of parents so the `in` list stays sane.
      const parentChunks = spec.parent
        ? Array.from({ length: Math.ceil(ids.length / 200) }, (_, n) => ids.slice(n * 200, n * 200 + 200))
        : [null];
      let failure = null;
      for (const chunk of parentChunks) {
        let from = 0;
        for (;;) {
          const { data, error } = await readRestorePage(spec, storeId, sinceIso, chunk, from);
          if (error) {
            if (isCredentialError(error)) throw new Error("Cloud credentials rejected");
            failure = error.message ?? String(error);
            break;
          }
          const rows = data ?? [];
          if (!rows.length) break;
          collected.push(...rows);
          const res = await repo.restoreMerge(spec.table, rows);
          restored += res.merged;
          skipped += res.skipped;
          restoreState.restored += res.merged;
          restoreState.skipped += res.skipped;
          notify();
          if (rows.length < RESTORE_PAGE) break;
          from += RESTORE_PAGE;
        }
        if (failure) break;
      }
      if (!spec.parent) parentIds.set(spec.table, collected.map((r) => r.id).filter(Boolean));
      restoreState.tables.push({ table: spec.table, restored, skipped, error: failure });
    }
    // Configuration comes back too, otherwise a rebuilt till returns with
    // default receipt branding, rounding and payment rules.
    restoreState.table = "pos_settings";
    notify();
    try {
      const { data: settings, error: settingsError } = await supabase
        .from("pos_settings")
        .select("*")
        .maybeSingle();
      if (settingsError) throw new Error(settingsError.message ?? String(settingsError));
      if (settings) {
        await repo.mergeFromCloud("pos_settings", [{ ...settings, id: repo.SETTINGS_ID }]);
        restoreState.restored += 1;
        restoreState.tables.push({ table: "pos_settings", restored: 1, skipped: 0 });
      } else {
        restoreState.tables.push({ table: "pos_settings", restored: 0, skipped: 0 });
      }
    } catch (err) {
      restoreState.tables.push({
        table: "pos_settings",
        restored: 0,
        skipped: 0,
        error: String(err?.message ?? err),
      });
    }
    restoreState.running = false;
    restoreState.finishedAt = new Date().toISOString();
    await repo.setState("last_restore_at", restoreState.finishedAt).catch(() => {});
    notify();
    return { ok: true, ...restoreState };
  } catch (err) {
    restoreState.running = false;
    restoreState.error = String(err?.message ?? err);
    restoreState.finishedAt = new Date().toISOString();
    notify();
    return { ok: false, error: restoreState.error, ...restoreState };
  }
}



async function run() {
  if (running || !enabled || !supabase) return;
  // Credentials rejected: stay parked (local trading unaffected) until an
  // admin saves fresh keys, which re-inits the worker and clears the flag.
  if (credentialsInvalid) return;
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
      credentialsInvalid,
      cloudMissing: [...cloudMissing.keys()],
      tables: await repo.stats(),
      queue: await repo.queueRows(60),
      lastPushAt: await repo.getState("last_push_at"),
      lastPullAt: await repo.getState("last_pull_at"),
      lastRestoreAt: await repo.getState("last_restore_at").catch(() => null),
      restore: restoreStatus(),

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

module.exports = { init, start, stop, setEnabled, push, pull, restore, restoreStatus, run, status };