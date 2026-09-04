import { supabaseExternal } from "@/integrations/supabase/external-client";
import { logSync } from "./sync-log";
import { hasRequiredPlatformConfig } from "./platform-config-ready";

import { replayOrder } from "./activity-journal";
import { isTerminalRevoked } from "./use-revocation-check";
import { tableSyncAllowed } from "./sync-policy";
import { canRelay, hasStaffSession, relayOp } from "@/core/api/sync-relay";
import { preferRelay } from "./pos-auth-route";
import {
  effectiveDatabaseMode,
  isConnectionError,
  noteConnectionLost,
  noteConnectionRestored,
  subscribeDatabaseMode,
} from "@/core/local-db/db-mode";
import {
  lastSuccessfulPull,
  setLastSuccessfulPull,
  lastTablePull,
  setLastTablePull,
  setSyncState,
  syncState,
} from "./sync-status";
import { writeSnapshot } from "./offline-snapshot";
import { recordSync } from "./sync-audit";
import {
  beginSyncRun,
  endSyncRun,
  markTableSync,
} from "./sync-progress";
import { mirrorToLocal } from "./sync-audit";

/**
 * The central project rejecting this device's keys (HTTP 401/403, "Invalid
 * API key", an expired JWT). Never a row fault: queued writes keep their
 * place, sync parks, and the badge points at Settings → Database & Cloud
 * Connection. Saving fresh keys clears the flag and wakes the engine.
 */
const CREDENTIAL_ERROR_RE = /invalid api ?key|bad jwt|jwt expired|invalid token/i;

function isCredentialError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; message?: unknown };
  const status = Number(e.status ?? 0);
  if (status === 401 || status === 403) return true;
  return CREDENTIAL_ERROR_RE.test(String(e.message ?? ""));
}

function noteCredentialsInvalid(detail: string) {
  setSyncState({
    credentialsInvalid: true,
    lastError:
      "Sync paused — the central database rejected this device's keys. " +
      "Update them in Settings → Database & Cloud Connection.",
  });
  recordSync({ direction: "system", entity: "credentials", status: "failed", error: detail });
}

/**
 * Copy the freshly pulled catalogue into the embedded local database.
 * Catalogue is server-wins, so a straight overwrite is the correct merge.
 */
async function mirrorCloudState(state: unknown) {
  const source = (state ?? {}) as Record<string, unknown>;
  const map: Record<string, string> = {
    products: "products",
    members: "customers",
    bookings: "service_jobs",
  };
  for (const [key, entity] of Object.entries(map)) {
    const rows = source[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    const written = await mirrorToLocal(entity, rows);
    if (written) recordSync({ direction: "mirror", entity, records: written, status: "success" });
  }
}
import { loadCloudState } from "@/core/api/pos-db";
import { localDb } from "@/core/local-db/local-db";
import {
  checkHealth,
  startConnectivityMonitor,
  subscribeConnectivity,
  type Connectivity,
} from "@/core/activation/connection-health";
import { subscribeSyncConfig, syncConfig } from "./sync-config";
import { noteVersions } from "./row-versions";
import { recordConflict } from "./sync-conflicts";
import { TOMBSTONE_TABLES } from "./tombstones";
import {
  failOp,
  refuseOp,
  nextAttemptDue,
  isOnline,
  isOnlineSyncEnabled,
  listQueue,
  markSynced,
  resolveOp,
  type QueuedOp,
  type SyncOp,
} from "./sync-outbox";

/** Columns some older databases are missing; dropped on a schema-cache error. */
const OPTIONAL_COLUMNS: Record<string, string[]> = {
  pos_settings: [
    "company_name",
    "tax_number",
    "reg_number",
    "phone",
    "website",
    "fonts",
    "custom_lines",
    "qr",
    "whatsapp_settings",
    "day_start_time",
    "day_end_time",
    "max_shift_hours",
    "shift_reminder_minutes",
    "ui_visibility",
  ],
};

/**
 * PostgREST reports an unknown column as
 * `Could not find the 'day_end_time' column of 'pos_settings' in the schema cache`.
 * Pull the column name out so the row can be retried without it.
 */
const missingColumn = (message: string): string | null =>
  /Could not find the '([^']+)' column/i.exec(message)?.[1] ?? null;

const strip = (rows: Record<string, unknown>[], columns: string[]) =>
  rows.map((r) => {
    const copy = { ...r };
    for (const c of columns) delete copy[c];
    return copy;
  });

type PostgrestError = { message: string; code?: string };

/** True when the database refused the write because of who the caller is. */
const isPermissionError = (error: PostgrestError) =>
  error.code === "42501" ||
  error.code === "PGRST301" ||
  /row-level security|permission denied|jwt/i.test(error.message);

/**
 * Tables the central database refused for this account in this session.
 *
 * Once a direct write is refused there is no point attempting it again — the
 * answer will not change until the account is signed in again. Remembering the
 * refusal sends later writes for that table straight through the server relay,
 * which keeps the console clean and saves a round trip. Accounts that are
 * allowed keep the faster direct path.
 */
const refusedTables = new Set<string>();

/**
 * Wording for a server that has lost the central database key. It is a server
 * setup task, not something the person at the till can fix.
 */
const KEY_MISSING =
  "Syncing paused — an administrator must re-save the central database key on the server. " +
  "Your work is saved on this device and will upload automatically.";

/** Relay the operation and report the outcome in plain language. */
async function viaRelay(context: string, op: SyncOp): Promise<{ ok: boolean; error?: string }> {
  const relayed = await relayOp(op);
  // The server relay cannot write without its key. Anyone signed in with a real
  // staff account still can, using their own session, so try that before giving
  // up and leaving the change in the queue.
  if (!relayed.ok && relayed.code === "NO_SERVICE_KEY") {
    if (hasStaffSession()) {
      const direct = await execute(op);
      if (!direct.error) {
        logSync("push", op.table, true, `${context} (direct — server key missing)`);
        return { ok: true };
      }
      logSync("push", op.table, false, `${context}: ${describeError(op.table, direct.error)}`);
      return { ok: false, error: describeError(op.table, direct.error) };
    }
    logSync("push", op.table, false, `${context}: ${KEY_MISSING}`);
    return { ok: false, error: KEY_MISSING };
  }
  logSync(
    "push",
    op.table,
    relayed.ok,
    relayed.ok
      ? `${context} (via server)`
      : `${context}: ${relayed.error ?? "the server could not save this change"}`,
  );
  return relayed;
}

/** Plain-language message for a failed push. */
const describeError = (table: string, error: PostgrestError) => {
  if (error.code === "PGRST205") {
    return `The "${table}" table is missing on the central database — an administrator needs to run the database setup script once.`;
  }
  if (isPermissionError(error)) {
    if (!hasStaffSession() && !canRelay()) {
      return `Not signed in to the central database, so "${table}" could not be saved. Sign in again (or activate this till) and the queued changes will go through.`;
    }
    if (/permission denied for function/i.test(error.message)) {
      return `The central database refused a permission check while saving "${table}" (${error.message}). An administrator needs to run supabase/sql/99_fix_grants_and_helpers.sql once.`;
    }
    return `The central database's access rules refused to save "${table}" for this account (${error.message}). Check the account's branch assignment and role.`;
  }
  return error.message;
};

/** Table names are dynamic here, so the generated row types don't apply. */
type LooseQuery = {
  insert: (rows: unknown) => PromiseLike<QueryResult>;
  upsert: (rows: unknown, opts: { onConflict: string }) => PromiseLike<QueryResult>;
  update: (values: unknown) => LooseFilter;
  delete: () => LooseFilter;
};
type LooseFilter = PromiseLike<QueryResult> & { eq: (col: string, val: unknown) => LooseFilter };
type QueryResult = { error: { message: string; code?: string } | null };

const from = (table: string) =>
  (supabaseExternal as unknown as { from: (t: string) => LooseQuery }).from(table);

async function execute(op: SyncOp): Promise<QueryResult> {
  switch (op.kind) {
    case "insert": {
      // Replaying a queued insert must never create a second copy: when every
      // row carries its own id, that id is the idempotency key, so a retry on
      // a flaky link lands on the same row instead of duplicating a sale or a
      // shift.
      const keyed =
        op.rows.length > 0 &&
        op.rows.every(
          (r) => typeof (r as { id?: unknown }).id === "string" && (r as { id: string }).id,
        );
      return keyed
        ? from(op.table).upsert(op.rows, { onConflict: "id" })
        : from(op.table).insert(op.rows);
    }
    case "upsert":
      return from(op.table).upsert(op.rows, { onConflict: op.onConflict ?? "id" });
    case "update": {
      let q = from(op.table).update(op.values);
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case "delete": {
      // Reference tables are stamped, not erased: an absent row cannot travel
      // down a delta pull, so every till would keep its stale copy forever.
      if (TOMBSTONE_TABLES.has(op.table)) {
        const stamp = new Date().toISOString();
        let q = from(op.table).update({ deleted_at: stamp, updated_at: stamp });
        for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
        return q;
      }
      let q = from(op.table).delete();
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case "rpc": {
      // The database works the change out itself; we only send identifiers.
      const client = supabaseExternal as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<QueryResult>;
      };
      return client.rpc(op.fn, op.args);
    }
  }
}


/** Codes the relay uses when a change is refused on principle. */
const REFUSAL_CODES = new Set([
  "STORE_FORBIDDEN",
  "PERMISSION_DENIED",
  "SCOPE_MISSING",
  "SCOPE_STALE",
  "TABLE_FORBIDDEN",
]);

/**
 * Stamp the change with the record version this till was working from. The
 * central database keeps whichever copy is newer, so an edit made from an
 * hour-old copy can no longer undo work someone else did in the meantime.
 */
function versionedOp(entry: QueuedOp): SyncOp {
  const versions = entry.baseVersions;
  if (!versions || !Object.keys(versions).length) return entry.op;
  if (entry.op.kind === "upsert") {
    return {
      ...entry.op,
      rows: entry.op.rows.map((r) => {
        const v = versions[String(r["id"] ?? "")];
        return typeof v === "number" ? { ...r, row_version: v } : r;
      }),
    };
  }
  if (entry.op.kind === "update") {
    const v = versions[String(entry.op.match["id"] ?? "")];
    return typeof v === "number"
      ? { ...entry.op, values: { ...entry.op.values, row_version: v } }
      : entry.op;
  }
  return entry.op;
}

/**
 * After a change goes up, check what version the central copy ended on. If it
 * has moved further than this change could explain, someone else edited the
 * same record and the central copy was kept — that is recorded so the person
 * at the till is told rather than believing their edit stuck.
 */
async function reconcileVersions(entry: QueuedOp): Promise<void> {
  const versions = entry.baseVersions;
  if (!versions || !Object.keys(versions).length) return;
  const ids = Object.keys(versions);
  try {
    const { data, error } = await (
      supabaseExternal as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              col: string,
              values: string[],
            ) => PromiseLike<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      }
    )
      .from(entry.op.table)
      .select("id,row_version")
      .in("id", ids);
    if (error || !data) return;
    noteVersions(entry.op.table, data);
    for (const row of data) {
      const id = String(row["id"] ?? "");
      const central = row["row_version"];
      const base = versions[id];
      if (typeof central !== "number" || typeof base !== "number") continue;
      // One step on is this till's own change landing. Anything beyond that
      // means another change went in first and won.
      if (central <= base + 1) continue;
      recordConflict({
        table: entry.op.table,
        recordId: id,
        context: entry.context,
        baseVersion: base,
        centralVersion: central,
      });
      logSync(
        "push",
        entry.op.table,
        false,
        `${entry.context}: the central copy of this record is newer (version ${central}), so it was kept`,
      );
    }
  } catch {
    /* the next pull brings the central copy down anyway */
  }
}

/**
 * A refused change is parked immediately with its reason; anything else keeps
 * its place in the queue and is retried.
 */
function recordRelayFailure(entry: QueuedOp, relayed: { error?: string; code?: string }) {
  const message = relayed.error ?? "The server could not save this change";
  if (relayed.error && CREDENTIAL_ERROR_RE.test(relayed.error)) noteCredentialsInvalid(relayed.error);
  if (relayed.code && REFUSAL_CODES.has(relayed.code)) refuseOp(entry.id, message);
  else failOp(entry.id, message);
  logSync("push", entry.op.table, false, `${entry.context}: ${message}`);
}

async function runOne(entry: QueuedOp): Promise<boolean> {
  // This account has already been refused on this table — go straight to the
  // relay instead of triggering another refused request.
  // A PIN sign-in never holds a cloud account, so it always takes the relay.
  if (
    (entry.op.table === "stores" || refusedTables.has(entry.op.table) || preferRelay()) &&
    canRelay()
  ) {
    const relayed = await viaRelay(entry.context, versionedOp(entry));
    if (relayed.ok) {
      resolveOp(entry.id);
      await reconcileVersions(entry);
      return true;
    }
    recordRelayFailure(entry, relayed);
    return false;
  }

  let res = await execute(versionedOp(entry));
  // PGRST204 = column missing from the schema cache. Older databases simply do
  // not have the newer columns yet, so drop whichever column the error names
  // (falling back to the known-optional list) and retry until the core row saves.
  if (entry.op.kind === "upsert" || entry.op.kind === "insert") {
    const dropped: string[] = [];
    let guard = 0;
    while (res.error?.code === "PGRST204" && guard++ < 12) {
      const named = missingColumn(res.error.message);
      const next = named ? [named] : (OPTIONAL_COLUMNS[entry.op.table] ?? []);
      if (!next.length || next.every((c) => dropped.includes(c))) break;
      dropped.push(...next);
      res = await execute({
        ...versionedOp(entry),
        rows: strip(entry.op.rows, dropped),
      } as SyncOp);
    }
  }
  if (res.error) {
    // Keys rejected: park the whole engine; the entry keeps its place and no
    // attempt counter burns while the credentials are wrong.
    if (isCredentialError(res.error)) {
      noteCredentialsInvalid(String(res.error.message ?? "credential error"));
      return false;
    }
    // A till signed in with a username + PIN has no cloud account, so the row
    // rules refuse the write. Send the very same operation through the server
    // relay, which proves the till and writes on its behalf.
    if (isPermissionError(res.error) && canRelay()) {
      refusedTables.add(entry.op.table);
      const relayed = await viaRelay(entry.context, versionedOp(entry));
      if (relayed.ok) {
        resolveOp(entry.id);
        await reconcileVersions(entry);
        return true;
      }
      recordRelayFailure(entry, relayed);
      return false;
    }
    const message = describeError(entry.op.table, res.error);
    if (isConnectionError(res.error)) noteConnectionLost();
    failOp(entry.id, message);
    logSync("push", entry.op.table, false, `${entry.context}: ${message}`);
    return false;
  }
  resolveOp(entry.id);
  logSync("push", entry.op.table, true, entry.context);
  await reconcileVersions(entry);
  return true;
}

/**
 * Live write for the Android build: send the operation to the backend now and
 * report the result. Nothing is stored or retried on the device.
 */
export async function runOpLive(context: string, op: SyncOp): Promise<void> {
  if ((op.table === "stores" || refusedTables.has(op.table) || preferRelay()) && canRelay()) {
    const relayed = await viaRelay(context, op);
    if (relayed.ok) return;
    throw new Error(relayed.error ?? "The server could not save this change");
  }

  let res = await execute(op);
  // Older databases are missing newer columns. Drop whichever column the
  // error names and retry until the core row saves, exactly like the queued
  // path does, so a direct (online-first) write never fails on schema drift.
  if (op.kind === "upsert" || op.kind === "insert") {
    const dropped: string[] = [];
    let guard = 0;
    while (res.error?.code === "PGRST204" && guard++ < 12) {
      const named = missingColumn(res.error.message);
      const next = named ? [named] : (OPTIONAL_COLUMNS[op.table] ?? []);
      if (!next.length || next.every((c) => dropped.includes(c))) break;
      dropped.push(...next);
      res = await execute({ ...op, rows: strip(op.rows, dropped) } as SyncOp);
    }
  }
  if (res.error) {
    if (isPermissionError(res.error) && canRelay()) {
      refusedTables.add(op.table);
      const relayed = await viaRelay(context, op);
      if (relayed.ok) return;
      throw new Error(
        relayed.error
          ? `The central database refused this change and the server relay could not save it either: ${relayed.error}`
          : "The server could not save this change",
      );
    }
    const message = describeError(op.table, res.error);
    logSync("push", op.table, false, `${context}: ${message}`);
    throw new Error(message);
  }
  logSync("push", op.table, true, context);
}

let draining = false;

/**
 * Push queued writes in the order they happened. Entries are replayed
 * oldest-first per terminal, and a failure blocks only that terminal's queue,
 * so one stuck branch never holds up another. Dependent operations (sale then
 * sale_items) therefore always land in sequence.
 */
export async function drainOutbox(): Promise<{ pushed: number; failed: number }> {
  // A revoked terminal keeps selling locally but is cut off from the cloud.
  if (!isOnline()) setSyncState({ phase: "offline", pending: listQueue().length });
  // Keys rejected: stay parked until fresh ones are saved — no retry storm.
  if (syncState().credentialsInvalid) return { pushed: 0, failed: 0 };
  if (draining || !isOnline() || !isOnlineSyncEnabled() || isTerminalRevoked())
    return { pushed: 0, failed: 0 };
  draining = true;
  setSyncState({ phase: "syncing", pending: listQueue().length });
  let pushed = 0;
  let failed = 0;
  const blocked = new Set<string>();
  // One pass sends at most a batch, so a long queue can never hold the
  // checkout UI or the rest of the cycle behind it.
  const batchSize = syncConfig().batchSize;
  try {
    for (const entry of replayOrder(listQueue())) {
      if (pushed + failed >= batchSize) break;
      if (entry.quarantined) continue;
      // Branch-level switches: held writes stay queued, never dropped.
      if (!tableSyncAllowed(entry.op.table)) continue;
      const terminal = entry.terminalId ?? "legacy";
      if (blocked.has(terminal)) continue;
      // Capped exponential backoff with spread: 5s, 15s, 45s … up to 5 min.
      if (entry.attempts > 0 && Date.now() < nextAttemptDue(entry)) continue;
      const ok = await runOne(entry);
      if (ok) pushed += 1;
      else {
        failed += 1;
        blocked.add(terminal);
      }
    }

    if (pushed) markSynced();
    // A successful push proves the connection is back, so online mode resumes.
    if (pushed) noteConnectionRestored();
  } finally {
    draining = false;
    setSyncState({
      phase: isOnline() ? "idle" : "offline",
      pending: listQueue().length,
      // A clean push proves the saved keys work — clear any earlier rejection.
      ...(pushed && !failed
        ? { lastSyncAt: new Date().toISOString(), lastError: null, credentialsInvalid: false }
        : {}),
    });
  }
  return { pushed, failed };
}

/* ---------------------------- downward sync ---------------------------- */

/** Tables the central database owns; a till only ever reads these back. */
const PULL_TABLES = [
  "products",
  "members",
  "membership_tiers",
  "promotions",
  "stores",
  "suppliers",
  "bookings",
  "stock_transfers",
  "held_orders",
] as const;

let pulling = false;

/**
 * Which timestamp column each table actually carries. Probed once, then
 * remembered, so a table without `updated_at` doesn't fire a failing request
 * (HTTP 400) on every polling cycle.
 */
const stampColumn = new Map<string, "updated_at" | "created_at">();

async function countChangedSince(table: (typeof PULL_TABLES)[number], since: string) {
  const ask = (column: string) =>
    supabaseExternal.from(table).select("id", { count: "exact", head: true }).gt(column, since);

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
 * Bring down everything changed centrally since the last clean pull, so a
 * price edited at head office reaches this till without a restart.
 */
export async function pullDelta(): Promise<{ merged: number }> {
  if (pulling || !isOnline() || !isOnlineSyncEnabled()) return { merged: 0 };
  // Keys rejected: stay parked until fresh ones are saved.
  if (syncState().credentialsInvalid) return { merged: 0 };
  pulling = true;
  const fallbackSince = lastSuccessfulPull() ?? "1970-01-01T00:00:00.000Z";
  const startedAt = new Date().toISOString();
  let changed = 0;
  const clean: string[] = [];
  try {
    beginSyncRun(PULL_TABLES.filter((table) => tableSyncAllowed(table)));
    for (const table of PULL_TABLES) {
      if (!tableSyncAllowed(table)) continue;
      markTableSync(table, "syncing", "Checking for changes…");
      // Each table resumes from its own mark, so one failing table never
      // drags the rest back or hides their changes.
      const since = lastTablePull(table) ?? fallbackSince;
      // Only ask how many rows moved; the full refresh below does the reading.
      const { count, error } = await countChangedSince(table, since);
      if (error) {
        if (isCredentialError(error)) {
          noteCredentialsInvalid(error.message);
          return { merged: changed };
        }
        logSync("pull", table, false, error.message);
        recordSync({ direction: "pull", entity: table, status: "failed", error: error.message });
        markTableSync(
          table,
          /does not exist|not found|schema cache/i.test(error.message) ? "missing" : "failed",
          error.message,
        );
        continue;
      }
      clean.push(table);
      if (!count) {
        markTableSync(table, "synced", "Already up to date");
        continue;
      }
      changed += count;
      logSync("pull", table, true, `${count} row(s) changed centrally`);
      recordSync({ direction: "pull", entity: table, records: count, status: "success" });
      markTableSync(table, "synced", `${count} row(s) updated`);
    }
    // Something moved centrally: refresh the local copy in one consistent read.
    if (changed) {
      const state = await loadCloudState();
      writeSnapshot(state);
      // Server-wins mirror into the embedded database, so the till can open
      // its catalogue with no network at all.
      await mirrorCloudState(state);
      window.dispatchEvent(new CustomEvent("pos:cloud-refreshed"));
    }
    // Marks only advance for tables that answered and were merged cleanly.
    for (const table of clean) setLastTablePull(table, startedAt);
    setLastSuccessfulPull(startedAt);
    // A clean pull proves the saved keys work — clear any earlier rejection.
    setSyncState({ lastSyncAt: startedAt, credentialsInvalid: false });
    endSyncRun();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isCredentialError(e) || CREDENTIAL_ERROR_RE.test(message)) noteCredentialsInvalid(message);
    setSyncState({ lastError: message });
    recordSync({ direction: "pull", entity: "catalogue", status: "failed", error: message });
    endSyncRun(message);
  } finally {
    pulling = false;
  }
  return { merged: changed };
}

/**
 * Phase 1 of convergence: everything stored on this terminal and still marked
 * `pending_sync = 1` is pushed up, keyed on its own id (or the temporary id it
 * was given locally), so a replay updates rather than duplicates. The desktop
 * shell owns the local SQL Server connection and does the T-SQL side.
 */
export async function pushLocalPending(): Promise<{ pushed: number; failed: number }> {
  const bridge = localDb();
  if (!bridge || !isOnline() || !isOnlineSyncEnabled()) return { pushed: 0, failed: 0 };
  try {
    const res = await bridge.push();
    if (res.pushed) logSync("push", "local", true, `${res.pushed} queued local row(s) uploaded`);
    if (res.error) logSync("push", "local", false, res.error);
    return { pushed: res.pushed ?? 0, failed: res.failed ?? 0 };
  } catch (e) {
    logSync("push", "local", false, e instanceof Error ? e.message : String(e));
    return { pushed: 0, failed: 0 };
  }
}

/**
 * Phase 2 of convergence: bring central changes down into the terminal's own
 * database so the two stay in step even when nothing was sold here.
 */
export async function pullIntoLocal(): Promise<{ merged: number }> {
  const bridge = localDb();
  if (!bridge || !isOnline() || !isOnlineSyncEnabled()) return { merged: 0 };
  try {
    const res = await bridge.pull();
    if (res.merged)
      logSync("pull", "local", true, `${res.merged} row(s) refreshed on this terminal`);
    return { merged: res.merged ?? 0 };
  } catch (e) {
    logSync("pull", "local", false, e instanceof Error ? e.message : String(e));
    return { merged: 0 };
  }
}

let started = false;

/**
 * One sync at a time, and never on a flapping network.
 *
 * `runExclusive` is the mutex: a cycle that is already running absorbs any
 * request that arrives while it works, so a wobbling connection can't stack
 * up overlapping pushes. `wake` is debounced by five seconds for the same
 * reason — an access point that drops and returns three times in a row
 * produces exactly one catch-up.
 */
let cycleRunning = false;
let cycleQueued = false;

async function runCycle() {
  await drainOutbox();
  // Stock movements the central routine refused are parked, not lost. Retry
  // the ones that are due on every cycle so a transient refusal heals itself
  // instead of waiting for someone to press the button in Sync & Backup.
  try {
    const { retryAllUnappliedStock } = await import("./stock-recovery");
    await retryAllUnappliedStock();
  } catch {
    /* the parked rows stay visible in Sync & Backup for a manual retry */
  }
  await pullDelta();
  await pushLocalPending();
  await pullIntoLocal();
  await checkHealth(true);
}

export async function runExclusive(reason: string = "timer"): Promise<void> {
  // An unconfigured terminal has no central database to talk to. That is a
  // normal state, not a failure: no request is attempted and nothing is
  // inherited from the web deployment.
  const readiness = await hasRequiredPlatformConfig();
  if (!readiness.ready) return;
  if (cycleRunning) {
    cycleQueued = true;
    return;
  }
  cycleRunning = true;
  setSyncState({ phase: "syncing" });

  try {
    await runCycle();
    setSyncState({ phase: isOnline() ? "idle" : "offline" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSyncState({ phase: "idle", lastError: message });
    recordSync({ direction: "system", entity: reason, status: "failed", error: message });
  } finally {
    cycleRunning = false;
    if (cycleQueued) {
      cycleQueued = false;
      void runExclusive("queued");
    }
  }
}

/** True while a sync cycle holds the mutex. */
export const syncBusy = () => cycleRunning;

/**
 * Tables whose changes must reach this shop's own database at once rather
 * than on the next timer tick: staff accounts, roles and settings.
 */
const LIVE_TABLES = [
  "app_users",
  "staff_roles",
  "stores",
  "pos_settings",
  "pos_store_settings",
] as const;

/** Refresh the offline staff roster so a PIN sign-in works without the cloud. */
async function refreshStaffMirror(): Promise<void> {
  const { data, error } = await supabaseExternal.rpc("list_app_users");
  if (error) throw new Error(error.message);
  const { cacheStaffRoster } = await import("@/core/local-db/local-staff");
  await cacheStaffRoster((data ?? []) as Record<string, unknown>[]);
}

const RETRY_DELAYS_MS = [2000, 10000, 30000];
let liveTimer: number | undefined;

/**
 * Push a just-made change straight through instead of waiting for the timer.
 * Failures are retried with growing gaps and every attempt is logged, so a
 * record that never reaches the shop database is visible rather than silent.
 */
export async function syncNow(reason: string, attempt = 0): Promise<void> {
  try {
    await runExclusive(reason);
    await refreshStaffMirror();
    logSync("push", reason, true, "sent to this shop's database");
    recordSync({ direction: "push", entity: reason, status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSync("push", reason, false, message);
    recordSync({ direction: "push", entity: reason, status: "failed", error: message });
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined || typeof window === "undefined") return;
    window.setTimeout(() => void syncNow(reason, attempt + 1), delay);
  }
}

const NETWORK_DEBOUNCE_MS = 5000;

/** Start the background sync loop (called once from the app shell). */
export function startSyncEngine() {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  // Push queued work first, then bring central changes down, then converge the
  // terminal's own database in both directions — one cycle at a time.
  const tick = () => void runExclusive("timer");
  // The cycle timer and the heartbeat both follow the saved settings, so a
  // change in Settings -> Sync takes effect at once, without a restart.
  let timer = window.setInterval(tick, syncConfig().intervalMs);
  let stopMonitor = startConnectivityMonitor(syncConfig().heartbeatMs);
  let appliedInterval = syncConfig().intervalMs;
  let appliedHeartbeat = syncConfig().heartbeatMs;
  const offConfig = subscribeSyncConfig(() => {
    const cfg = syncConfig();
    if (cfg.intervalMs !== appliedInterval) {
      appliedInterval = cfg.intervalMs;
      window.clearInterval(timer);
      timer = window.setInterval(tick, appliedInterval);
    }
    if (cfg.heartbeatMs !== appliedHeartbeat) {
      appliedHeartbeat = cfg.heartbeatMs;
      stopMonitor();
      stopMonitor = startConnectivityMonitor(appliedHeartbeat);
    }
  });
  let debounce: number | undefined;
  // Five seconds of quiet before reacting: network flap protection.
  const wake = () => {
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      debounce = undefined;
      if (!isOnline()) return;
      void runExclusive("network");
    }, NETWORK_DEBOUNCE_MS);
  };
  const sleep = () => {
    if (debounce) window.clearTimeout(debounce);
    debounce = undefined;
    setSyncState({ phase: "offline" });
  };
  // Flipping the switch back to online catches up immediately instead of
  // waiting for the next timer tick.
  let lastMode = effectiveDatabaseMode();
  const offMode = subscribeDatabaseMode(() => {
    const mode = effectiveDatabaseMode();
    if (mode === lastMode) return;
    lastMode = mode;
    if (mode === "online") wake();
  });
  // One heartbeat for the whole app decides whether we are online — the
  // browser's own flag lies on captive networks. A confirmed reconnect forces
  // a catch-up pass at once instead of waiting for the next tick.
  const offConnectivity = subscribeConnectivity((state: Connectivity) => {
    if (state === "offline") sleep();
    else if (state === "online") wake();
  });

  // Live listener: an account or settings change made anywhere lands in this
  // shop's own database within a second instead of waiting for the timer.
  const live = supabaseExternal.channel("pos-live-settings");
  for (const table of LIVE_TABLES) {
    live.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      if (liveTimer) window.clearTimeout(liveTimer);
      // One catch-up for a burst of related edits.
      liveTimer = window.setTimeout(() => {
        liveTimer = undefined;
        void syncNow(`live:${table}`);
      }, 400);
    });
  }
  live.subscribe();
  tick();
  return () => {
    window.clearInterval(timer);
    offConfig();
    stopMonitor();
    offConnectivity();
    if (debounce) window.clearTimeout(debounce);
    if (liveTimer) window.clearTimeout(liveTimer);
    void supabaseExternal.removeChannel(live);
    offMode();
    started = false;

  };
}
