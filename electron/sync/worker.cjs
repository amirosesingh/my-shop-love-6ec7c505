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
const sqlite = require("../db/sqlite.cjs");

const DEFAULT_WORKER_CONFIG = { batchSize: 50, intervalMs: 30_000, maxAttempts: 5 };
let workerConfig = { ...DEFAULT_WORKER_CONFIG };

function isNewSupabaseApiKey(value) {
  const key = String(value ?? "");
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

function supabaseKeyFetch(key) {
  return async (input, init) => {
    const requestHeaders =
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
    const headers = new Headers(requestHeaders);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    if (typeof Request !== "undefined" && input instanceof Request) {
      return fetch(new Request(input, { ...init, headers }));
    }
    return fetch(input, { ...init, headers });
  };
}

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
let mutationPath = "pending-auth";
let lastBusinessPush = null;
const CREDENTIAL_ERROR_RE =
  /invalid api ?key|bad jwt|jwt expired|invalid token|unauthorized|not recognised|forbidden/i;

function isCredentialError(err) {
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (status === 401 || status === 403) return true;
  const msg = String(err?.message ?? err ?? "");
  // A bare HTTP 400/401/403 embedded in a relay error message counts too.
  return CREDENTIAL_ERROR_RE.test(msg) || /\((401|403)\)/.test(msg);
}

function safeFailureReason(value) {
  const message = String(value ?? "sync failed");
  if (/central database key missing|NO_SERVICE_KEY/i.test(message)) return "central-config";
  if (/PENDING_AUTH/i.test(message)) return "pending-auth";
  if (/STORE_FORBIDDEN|branch/i.test(message)) return "branch-mismatch";
  if (/permission|forbidden|unauthorized|session has ended/i.test(message)) return "authorization-refused";
  if (/timed? ?out|network|fetch|connect|temporar/i.test(message)) return "cloud-unreachable";
  return "cloud-refused";
}

/** Rows per request on every pull; the server caps a single read well below a
 *  fortnight of catalogue edits, so both pull paths page instead of truncate. */
const PULL_PAGE = 1000;

/**
 * Reads every page of a delta query.
 *
 * `build(column, from)` returns one page of the query. Ordering is by the
 * timestamp then the id so a row can never be skipped or seen twice between
 * pages. The loop stops on the first short page.
 */
async function pageAll(build, column) {
  const rows = [];
  for (let from = 0; ; from += PULL_PAGE) {
    const res = await build(column, from);
    if (res.error) return res;
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length < PULL_PAGE) break;
  }
  return { data: rows, error: null };
}

async function selectChangedSince(table, since) {
  const ask = (column, from) =>
    supabase
      .from(table)
      .select("*")
      .gt(column, since)
      .order(column, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE - 1);
  const known = stampColumn.get(table);
  if (known) return await pageAll(ask, known);
  let res = await pageAll(ask, "updated_at");
  if (!res.error) {
    stampColumn.set(table, "updated_at");
    return res;
  }
  res = await pageAll(ask, "created_at");
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
  const build = (column, from) => {
    let query = supabase.from(spec.table).select("*").gt(column, since);
    if (spec.storeColumns?.length === 1) query = query.eq(spec.storeColumns[0], storeId);
    else if (spec.storeColumns?.length) {
      query = query.or(spec.storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
    }
    if (spec.parent) query = query.in(spec.parent.column, parentIds ?? []);
    return query
      .order(column, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE - 1);
  };
  if (stamp) return await pageAll(build, stamp);
  let res = await pageAll(build, "updated_at");
  if (!res.error) {
    stampColumn.set(spec.table, "updated_at");
    return res;
  }
  res = await pageAll(build, "created_at");
  if (!res.error) stampColumn.set(spec.table, "created_at");
  return res;
}

/**
 * Merges a pulled page, then removes anything the cloud has marked deleted.
 * The stamped row is merged first so the till has something to act on even if
 * the removal is refused by a delete guard.
 */
async function mergeWithTombstones(table, rows) {
  const merged = await repo.mergeFromCloud(table, rows);
  const gone = rows
    .filter((row) => row?.deleted_at)
    .map((row) => row.id)
    .filter(Boolean);
  if (gone.length && typeof repo.applyTombstones === "function") {
    await repo.applyTombstones(table, gone).catch(() => {});
  }
  return merged;
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

function init({
  url,
  key,
  accessToken,
  sessionToken,
  cashierToken,
  terminalToken,
  branchId,
  relayUrl: relay,
  onChange,
}) {
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: supabaseKeyFetch(key),
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    },
  });
  credentials = { accessToken, sessionToken, cashierToken, terminalToken, branchId };
  // Watermarks are per branch and per till, so one machine moved between
  // branches never resumes another branch's position.
  if (typeof repo.setScope === "function") {
    repo.setScope({ storeId: branchId, terminalId: credentials.terminalToken ?? "" });
  }
  relayUrl = relay || null;
  mutationPath = relayUrl ? "pending-auth" : accessToken ? "authenticated-direct" : "pending-auth";
  // Fresh credentials (re)saved: any earlier rejection no longer applies.
  credentialsInvalid = false;
  if (onChange) notify = onChange;
}

async function authenticatedDirectMutation(op) {
  if (!credentials.accessToken) {
    mutationPath = "pending-auth";
    throw new Error("PENDING_AUTH: sign in or re-register this terminal before cloud sync");
  }
  mutationPath = "authenticated-direct";
  if (op.kind === "insert" || op.kind === "upsert") {
    const { error } = await supabase
      .from(op.table)
      .upsert(op.rows ?? [], { onConflict: op.onConflict ?? "id" });
    if (error) throw error;
    return;
  }
  if (op.kind === "rpc") {
    const { error } = await supabase.rpc(op.fn, op.args ?? {});
    if (error) throw error;
    return;
  }
  let query =
    op.kind === "delete"
      ? supabase.from(op.table).delete()
      : supabase.from(op.table).update(op.values ?? {});
  for (const [column, value] of Object.entries(op.match ?? {})) query = query.eq(column, value);
  const { error } = await query;
  if (error) throw error;
}

async function cloudUpsert(table, rows, onConflict = "id") {
  const bearer = credentials.sessionToken || credentials.accessToken;
  if (relayUrl && (bearer || credentials.cashierToken || credentials.terminalToken)) {
    mutationPath = "relay";
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({
        sessionToken: credentials.sessionToken,
        cashierToken: credentials.cashierToken,
        terminalToken: credentials.terminalToken,
        ops: [{ kind: "upsert", table, rows, onConflict }],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || body.results?.some((result) => !result.ok)) {
      if (body?.code === "NO_SERVICE_KEY" && credentials.accessToken) {
        return authenticatedDirectMutation({ kind: "upsert", table, rows, onConflict });
      }
      throw new Error(
        body?.error ||
          body?.results?.find((result) => !result.ok)?.error ||
          `Sync relay failed (${response.status})`,
      );
    }
    return;
  }
  return authenticatedDirectMutation({ kind: "upsert", table, rows, onConflict });
}

async function cloudMutation(op) {
  if (op.kind === "insert" || op.kind === "upsert") return cloudUpsert(op.table, op.rows, op.onConflict ?? "id");
  const bearer = credentials.sessionToken || credentials.accessToken;
  if (relayUrl && (bearer || credentials.cashierToken || credentials.terminalToken)) {
    mutationPath = "relay";
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({
        sessionToken: credentials.sessionToken,
        cashierToken: credentials.cashierToken,
        terminalToken: credentials.terminalToken,
        ops: [op],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || body.results?.some((result) => !result.ok)) {
      if (body?.code === "NO_SERVICE_KEY" && credentials.accessToken) {
        return authenticatedDirectMutation(op);
      }
      throw new Error(body?.error || body?.results?.find((result) => !result.ok)?.error || `Sync relay failed (${response.status})`);
    }
    return;
  }
  return authenticatedDirectMutation(op);
}

/**
 * Pending branch rules are never table-upserted. The local row version is one
 * ahead of the confirmed version it was edited from, so replay uses that base
 * version and lets the canonical RPC reject a stale terminal explicitly.
 */
async function cloudSaveRules(rows) {
  for (const row of rows) {
    const patch = repo.toCloudRow("pos_store_settings", row);
    const storeId = String(patch.store_id ?? credentials.branchId ?? "");
    delete patch.store_id;
    delete patch.row_version;
    delete patch.updated_at;
    delete patch.updated_by;
    const expectedVersion = Math.max(0, Number(row.base_version ?? row.row_version ?? 0));
    const { error } = await supabase.rpc("pos_rules_save", {
      _store_id: storeId,
      _patch: patch,
      _expected_version: expectedVersion,
    });
    if (error) throw error;
  }
}

/**
 * Drain transaction batches whose rows and upload intent were committed in
 * one SQLite transaction. SQL Server remains a compatibility projection; on
 * acknowledgement its matching rows are marked synced so the legacy pass
 * below cannot upload the same batch a second time.
 */
async function pushSqliteBusinessBatches() {
  const batches = sqlite.pendingBusinessBatches?.(workerConfig.batchSize) ?? [];
  let pushed = 0;
  let failed = 0;
  for (const batch of batches) {
    const ops = Array.isArray(batch.payload?.ops) ? batch.payload.ops : [];
    try {
      const pushStartedAt = new Date().toISOString();
      lastBusinessPush = { batchId: batch.id, clientTransactionId: batch.client_transaction_id ?? null,
        localCommittedAt: batch.created_at, pushStartedAt, acknowledgedAt: null,
        durationMs: null, result: "pushing" };
      // Repair the direct local SQL Server projection first. Cloud availability
      // must never decide whether a durable SQLite transaction becomes visible
      // in the shop's operational SQL database.
      const sqlProjectionTables = new Set(repo.TABLES ?? []);
      const projectionOps = ops.filter(
        (op) =>
          op?.kind !== "rpc" &&
          op?.table !== "pos_store_settings" &&
          sqlProjectionTables.has(op?.table),
      );
      if (projectionOps.length) await repo.applyOps(projectionOps);

      const saleOp = ops.find((op) => op?.table === "sales" && Array.isArray(op.rows) && op.rows.length === 1);
      const atomicTables = new Set(["sales", "sale_items", "payment_transactions", "item_activity_logs"]);
      let replayOps = ops;
      if (saleOp) {
        const sale = saleOp.rows[0];
        const rowsFor = (table) => ops.filter((op) => op?.table === table).flatMap((op) => op.rows ?? []);
        await cloudMutation({
          kind: "rpc",
          table: "sales",
          fn: "pos_sale_commit",
          args: {
            _sale: repo.toCloudRow("sales", sale),
            _items: rowsFor("sale_items").map((row) => repo.toCloudRow("sale_items", row)),
            _payments: rowsFor("payment_transactions").map((row) => repo.toCloudRow("payment_transactions", row)),
            _movements: rowsFor("item_activity_logs").map((row) => repo.toCloudRow("item_activity_logs", row)),
            _member: rowsFor("members")[0] ? repo.toCloudRow("members", rowsFor("members")[0]) : null,
            _exchange_bill: sale.original_bill_number ?? null,
          },
        });
        replayOps = ops.filter((op) => !atomicTables.has(op.table) && op.table !== "members");
      }
      for (const op of replayOps) {
        if (!op?.kind || !op.table) {
          throw new Error("Unsupported operation in SQLite business outbox");
        }
        const rows = Array.isArray(op.rows) ? op.rows : [];
        const payload = stripAbsoluteStock(op.table, rows.map((row) => repo.toCloudRow(op.table, row)));
        if (op.table === "pos_store_settings") await cloudSaveRules(rows);
        else await cloudMutation({ ...op, ...(rows.length ? { rows: payload } : {}) });
        if (op.table === "item_activity_logs") {
          const delta = await applyStockDeltas(payload);
          if (delta?.error) throw new Error(delta.error);
        }
      }
      for (const op of ops) {
        const ids = (op.rows ?? []).map((row) => row?.id).filter(Boolean);
        if (ids.length) await repo.markSynced(op.table, ids).catch(() => {});
      }
      sqlite.acknowledgeBusinessBatch(batch.id);
      const acknowledgedAt = new Date().toISOString();
      lastBusinessPush = { ...lastBusinessPush, acknowledgedAt,
        durationMs: Date.parse(acknowledgedAt) - Date.parse(pushStartedAt), result: "synced" };
      pushed += 1;
    } catch (error) {
      const message = error?.message ?? String(error);
      if (/unauthorized|forbidden|permission|session has ended|STORE_FORBIDDEN/i.test(message))
        mutationPath = "authorization-refused";
      const reason = safeFailureReason(message);
      lastBusinessPush = { ...lastBusinessPush, result: reason === "central-config" ? "pending" : "failed", reason };
      if (reason === "central-config") {
        // The till and its SQL Server are healthy; only the central relay is
        // missing its server-side key. Keep the batch pending without burning
        // retry attempts or moving a valid sale into Needs attention.
        sqlite.deferBusinessBatch?.(batch.id, message);
        return { pushed, failed, deferred: true, error: "central-config" };
      }
      sqlite.failBusinessBatch(batch.id, message, /STALE_RULES/i.test(message) ? 1 : workerConfig.maxAttempts);
      failed += 1;
      // Preserve batch order: a later transaction must not overtake a failed
      // earlier transaction from the same terminal.
      break;
    }
  }
  return { pushed, failed };
}

function setEnabled(on) {
  enabled = !!on;
  notify();
  if (enabled) void run();
}

function start() {
  if (timer) return;
  timer = setInterval(() => void run(), workerConfig.intervalMs);
  void run();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function setConfig(patch = {}) {
  const next = {
    batchSize: Math.min(500, Math.max(1, Number(patch.batchSize ?? workerConfig.batchSize) || DEFAULT_WORKER_CONFIG.batchSize)),
    intervalMs: Math.min(300_000, Math.max(5_000, Number(patch.intervalMs ?? workerConfig.intervalMs) || DEFAULT_WORKER_CONFIG.intervalMs)),
    maxAttempts: Math.min(50, Math.max(1, Number(patch.maxAttempts ?? workerConfig.maxAttempts) || DEFAULT_WORKER_CONFIG.maxAttempts)),
  };
  const restart = next.intervalMs !== workerConfig.intervalMs && !!timer;
  workerConfig = next;
  if (restart) {
    stop();
    start();
  }
  notify();
  return { ...workerConfig };
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
  const sqliteResult = await pushSqliteBusinessBatches();
  pushed += sqliteResult.pushed;
  failed += sqliteResult.failed;
  if (sqliteResult.failed || sqliteResult.deferred) {
    setPhase("idle");
    notify();
    return {
      ok: sqliteResult.failed === 0,
      pushed,
      failed,
      deferred: !!sqliteResult.deferred,
      error: sqliteResult.deferred ? "central-config" : "SQLite business batch upload failed",
    };
  }
  for (const table of repo.PUSH_TABLES ?? repo.TABLES) {
    const retryAt = cloudMissing.get(table);
    if (retryAt && Date.now() < retryAt) continue; // parked: central schema missing
    let rows;
    try {
      rows = await repo.pendingRows(table, workerConfig.batchSize);
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
      if (table === "pos_store_settings") await cloudSaveRules(rows);
      else await cloudUpsert(table, payload);
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
            error:
              "Cloud credentials rejected — update them in Settings → Database & Cloud Connection.",
          })
          .catch(() => {});
        setPhase("idle");
        notify();
        return { ok: false, pushed, failed, error: "credentials" };
      }
      failed += ids.length;
      if (UNSUPPORTED_RELAY_TABLE_RE.test(String(error.message ?? ""))) {
        cloudMissing.set(table, Date.now() + CLOUD_MISSING_RETRY_MS);
        const message = `This app version cannot relay "${table}". Update the POS/central app, then use Retry all parked rows. (${error.message})`;
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
      await repo.markFailed(table, ids, error.message, workerConfig.maxAttempts);
      await repo.setWatermark(table, null, { error: error.message }).catch(() => {});
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
              workerConfig.maxAttempts,
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
            error:
              "Cloud credentials rejected — update them in Settings → Database & Cloud Connection.",
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
    merged += await mergeWithTombstones(table, data ?? []);
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
      merged += await mergeWithTombstones(spec.table, rows);
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
  // Branch trading rules: this branch's row plus the business-wide row it
  // inherits from, so the register enforces the same limits with no connection.
  try {
    const rulesSince = await markFor("pos_store_settings");
    const rulesStartedAt = new Date().toISOString();
    const branch = credentials.branchId ? String(credentials.branchId) : "";
    const wanted = branch ? ["", branch] : [""];
    const { data: rules, error: rulesError } = await supabase
      .from("pos_store_settings")
      .select("*")
      .in("store_id", wanted)
      .gt("updated_at", rulesSince);
    if (rulesError) throw new Error(rulesError.message ?? String(rulesError));
    if (rules?.length) merged += await repo.mergeFromCloud("pos_store_settings", rules);
    await repo.setWatermark("pos_store_settings", rulesStartedAt, { error: null }).catch(() => {});
  } catch (err) {
    await repo.setWatermark("pos_store_settings", null, { error: String(err) }).catch(() => {});
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
  let query = supabase
    .from(spec.table)
    .select("*")
    .range(from, from + RESTORE_PAGE - 1);
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
    return {
      ok: false,
      error: "This till is not pinned to a branch — set the branch before restoring.",
    };
  }
  const specs = repo.RESTORE_TABLES ?? [];
  const sinceIso = new Date(
    Date.now() - Math.max(1, Number(days) || 90) * 86_400_000,
  ).toISOString();
  restoreState = {
    running: true,
    table: null,
    index: 0,
    total: specs.length + 1,
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
        ? Array.from({ length: Math.ceil(ids.length / 200) }, (_, n) =>
            ids.slice(n * 200, n * 200 + 200),
          )
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
    // The branch's own trading rules come back with everything else.
    restoreState.table = "pos_store_settings";
    notify();
    try {
      const wanted = storeId ? ["", storeId] : [""];
      const { data: rules, error: rulesError } = await supabase
        .from("pos_store_settings")
        .select("*")
        .in("store_id", wanted);
      if (rulesError) throw new Error(rulesError.message ?? String(rulesError));
      const count = rules?.length ? await repo.mergeFromCloud("pos_store_settings", rules) : 0;
      restoreState.restored += count;
      restoreState.tables.push({ table: "pos_store_settings", restored: count, skipped: 0 });
    } catch (err) {
      restoreState.tables.push({
        table: "pos_store_settings",
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

/* ------------------------------------------------------------------ *
 * Rebuild check and the wipe-and-restore drill.
 * ------------------------------------------------------------------ */

/** Ids of a parent table inside the restore window, for counting its children. */
async function centralParentIds(spec, storeId, sinceIso) {
  const ids = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(spec.table)
      .select("id")
      .range(from, from + RESTORE_PAGE - 1);
    if (spec.storeColumns?.length === 1) query = query.eq(spec.storeColumns[0], storeId);
    else if (spec.storeColumns?.length) {
      query = query.or(spec.storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
    }
    if (spec.dateColumn && sinceIso) query = query.gte(spec.dateColumn, sinceIso);
    const { data, error } = await query;
    if (error) throw new Error(error.message ?? String(error));
    const rows = data ?? [];
    ids.push(...rows.map((r) => r.id).filter(Boolean));
    if (rows.length < RESTORE_PAGE) break;
    from += RESTORE_PAGE;
  }
  return ids;
}

/** How many rows head office holds for this branch, in the same window. */
async function centralCount(spec, storeId, sinceIso, parentIds) {
  if (spec.parent) {
    const ids = parentIds.get(spec.parent.table) ?? [];
    if (!ids.length) return 0;
    let total = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { count, error } = await supabase
        .from(spec.table)
        .select("id", { count: "exact", head: true })
        .in(spec.parent.column, ids.slice(i, i + 200));
      if (error) throw new Error(error.message ?? String(error));
      total += count ?? 0;
    }
    return total;
  }
  let query = supabase.from(spec.table).select("id", { count: "exact", head: true });
  if (spec.storeColumns?.length === 1) query = query.eq(spec.storeColumns[0], storeId);
  else if (spec.storeColumns?.length) {
    query = query.or(spec.storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
  }
  if (spec.dateColumn && sinceIso) query = query.gte(spec.dateColumn, sinceIso);
  const { count, error } = await query;
  if (error) throw new Error(error.message ?? String(error));
  return count ?? 0;
}

/**
 * The rebuild check.
 *
 * Nothing is written and nothing is deleted: this only counts what the till
 * holds against what head office holds, table by table, over the same branch
 * and the same window the restore would use. "Behind" means a rebuild would
 * come back short; "ahead" simply means work is still waiting in the queue.
 */
async function verifyRestore({ days = 90 } = {}) {
  if (!supabase) return { ok: false, error: "Cloud client not ready" };
  const storeId = credentials.branchId ? String(credentials.branchId) : "";
  if (!storeId) {
    return { ok: false, error: "This till is not pinned to a branch — set the branch first." };
  }
  const specs = repo.RESTORE_TABLES ?? [];
  const sinceIso = new Date(
    Date.now() - Math.max(1, Number(days) || 90) * 86_400_000,
  ).toISOString();
  const local = await repo.restoreFingerprint({ days, storeId });
  const localByTable = new Map(local.tables.map((t) => [t.table, t]));
  const parentIds = new Map();
  const tables = [];
  for (const spec of specs) {
    const mine = localByTable.get(spec.table) ?? { count: 0 };
    let central = null;
    let error = null;
    try {
      const needsIds = specs.some((s) => s.parent?.table === spec.table);
      if (needsIds && !spec.parent) {
        parentIds.set(spec.table, await centralParentIds(spec, storeId, sinceIso));
      }
      central = await centralCount(spec, storeId, sinceIso, parentIds);
    } catch (err) {
      error = String(err?.message ?? err);
    }
    tables.push({
      table: spec.table,
      local: mine.count ?? 0,
      central,
      behind: central === null ? 0 : Math.max(0, central - (mine.count ?? 0)),
      ahead: central === null ? 0 : Math.max(0, (mine.count ?? 0) - central),
      error,
    });
  }
  const pending = await repo.pendingSyncCount().catch(() => ({ total: 0 }));
  const short = tables.filter((t) => t.behind > 0);
  const result = {
    ok: true,
    at: new Date().toISOString(),
    days,
    since: sinceIso,
    pending: pending.total ?? 0,
    tables,
    short: short.map((t) => t.table),
    verdict: short.length ? "short" : "complete",
  };
  await repo.setState("last_restore_check", JSON.stringify(result)).catch(() => {});
  notify();
  return result;
}

/** Why a drill cannot run right now, in the operator's words. */
async function drillBlockers() {
  const blockers = [];
  if (!supabase) blockers.push("The cloud connection is not set up.");
  else if (!(await reachable())) blockers.push("Head office cannot be reached from this till.");
  if (!credentials.branchId) blockers.push("This till is not pinned to a branch.");
  const pending = await repo.pendingSyncCount().catch(() => ({ total: 0 }));
  if ((pending.total ?? 0) > 0) {
    blockers.push(`${pending.total} record(s) still waiting to reach head office.`);
  }
  const open = await repo.openShiftCount().catch(() => 0);
  if (open > 0) blockers.push("A shift is still open — close it before running the drill.");
  if (restoreState?.running) blockers.push("A restore is already running.");
  return blockers;
}

let drillState = null;

function drillStatus() {
  return drillState;
}

/**
 * The drill: actually wipe this branch's history and restore it.
 *
 * A copy is taken first. The window is cleared, the ordinary restore runs, and
 * the result is compared row for row against the copy. Anything short and the
 * copy goes straight back, so a failed drill costs nothing but time.
 */
async function restoreDrill({ days = 90 } = {}) {
  if (drillState?.running) return { ok: false, error: "A drill is already running" };
  const blockers = await drillBlockers();
  if (blockers.length) return { ok: false, error: blockers.join(" "), blockers };

  const storeId = String(credentials.branchId);
  const specs = repo.RESTORE_TABLES ?? [];
  drillState = {
    running: true,
    phase: "copying",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    days,
    tables: [],
    rolledBack: false,
    verdict: null,
    error: null,
  };
  notify();

  const before = await repo.restoreFingerprint({ days, storeId });
  const beforeByTable = new Map(before.tables.map((t) => [t.table, t]));
  const copies = new Map();
  try {
    for (const spec of specs) {
      copies.set(spec.table, await repo.restoreSnapshot(spec.table, { days, storeId }));
    }

    drillState.phase = "clearing";
    notify();
    // Children first, so a parent is never removed out from under its lines.
    for (const spec of [...specs].reverse()) {
      await repo.restoreClear(spec.table, { days, storeId });
    }

    drillState.phase = "restoring";
    notify();
    const run = await restore({ days });
    if (!run.ok) throw new Error(run.error ?? "The restore did not finish");

    drillState.phase = "checking";
    notify();
    const after = await repo.restoreFingerprint({ days, storeId });
    const afterByTable = new Map(after.tables.map((t) => [t.table, t]));
    let lost = 0;
    for (const spec of specs) {
      const was = beforeByTable.get(spec.table) ?? { count: 0, checksum: 0 };
      const now = afterByTable.get(spec.table) ?? { count: 0, checksum: 0 };
      const missing = Math.max(0, (was.count ?? 0) - (now.count ?? 0));
      const changed = (was.checksum ?? 0) !== (now.checksum ?? 0);
      if (missing) lost += missing;
      drillState.tables.push({
        table: spec.table,
        before: was.count ?? 0,
        after: now.count ?? 0,
        missing,
        changed,
        pass: missing === 0,
      });
    }
    drillState.verdict = lost === 0 ? "pass" : "fail";

    if (lost > 0) {
      drillState.phase = "putting the copy back";
      notify();
      for (const spec of specs) {
        await repo.restoreReplace(spec.table, copies.get(spec.table) ?? []).catch(() => {});
      }
      drillState.rolledBack = true;
    }
  } catch (err) {
    drillState.error = String(err?.message ?? err);
    drillState.verdict = "fail";
    drillState.phase = "putting the copy back";
    notify();
    for (const spec of specs) {
      await repo.restoreReplace(spec.table, copies.get(spec.table) ?? []).catch(() => {});
    }
    drillState.rolledBack = true;
  }

  drillState.running = false;
  drillState.phase = "done";
  drillState.finishedAt = new Date().toISOString();
  await repo.setState("last_restore_drill", JSON.stringify(drillState)).catch(() => {});
  notify();
  return { ok: drillState.verdict === "pass", ...drillState };
}

/** The last check and drill results, as stored on the till. */
async function restoreEvidence() {
  const read = async (key) => {
    try {
      const raw = await repo.getState(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  return {
    check: await read("last_restore_check"),
    drill: await read("last_restore_drill"),
    blockers: await drillBlockers().catch(() => []),
  };
}

async function request(direction = "both") {
  if (running || !enabled || !supabase) return { ok: false, busy: running };
  // Credentials rejected: stay parked (local trading unaffected) until an
  // admin saves fresh keys, which re-inits the worker and clears the flag.
  if (credentialsInvalid) return { ok: false, error: "credentials" };
  running = true;
  try {
    if (!(await reachable())) return { ok: false, error: "unreachable" };
    if (direction === "push") return await push();
    if (direction === "pull") return await pull();
    const pushed = await push();
    const pulled = await pull();
    return {
      ok: pushed?.ok !== false && pulled?.ok !== false,
      pushed: pushed?.pushed ?? 0,
      failed: pushed?.failed ?? 0,
      merged: pulled?.merged ?? 0,
      error: pushed?.error ?? pulled?.error,
    };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  } finally {
    running = false;
  }
}

async function run() {
  return request("both");
}

async function status() {
  try {
    return {
      connected: true,
      phase,
      enabled,
      credentialsInvalid,
      mutationPath,
      businessBatches: sqlite.businessBatchStatus?.() ?? { pending: 0, failed: 0, parked: 0, sales: 0, rows: [] },
      lastBusinessPush,
      cloudMissing: [...cloudMissing.keys()],
      tables: await repo.stats(),
      queue: await repo.queueRows(60),
      lastPushAt: await repo.getState("last_push_at"),
      lastPullAt: await repo.getState("last_pull_at"),
      lastRestoreAt: await repo.getState("last_restore_at").catch(() => null),
      restore: restoreStatus(),
      drill: drillStatus(),
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

module.exports = {
  init,
  start,
  stop,
  setEnabled,
  setConfig,
  push,
  pull,
  request,
  restore,
  restoreStatus,
  verifyRestore,
  restoreDrill,
  drillStatus,
  restoreEvidence,
  run,
  status,
};
