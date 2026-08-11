import { supabaseExternal } from "@/integrations/supabase/external-client";
import { logSync } from "./sync-log";
import { replayOrder } from "./activity-journal";
import { isTerminalRevoked } from "./use-revocation-check";
import { tableSyncAllowed } from "./sync-policy";
import { canRelay, hasStaffSession, relayOp } from "./sync-relay";
import { preferRelay } from "./pos-auth-route";
import {
  effectiveDatabaseMode,
  isConnectionError,
  noteConnectionLost,
  noteConnectionRestored,
  subscribeDatabaseMode,
} from "./db-mode";
import {
  lastSuccessfulPull,
  setLastSuccessfulPull,
  setSyncState,
  syncState,
} from "./sync-status";
import { writeSnapshot } from "./offline-snapshot";
import { loadCloudState } from "./pos-db";
import {
  failOp,
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
async function viaRelay(
  context: string,
  op: SyncOp,
): Promise<{ ok: boolean; error?: string }> {
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
        op.rows.every((r) => typeof (r as { id?: unknown }).id === "string" && (r as { id: string }).id);
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
      let q = from(op.table).delete();
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
  }
}

async function runOne(entry: QueuedOp): Promise<boolean> {
  // This account has already been refused on this table — go straight to the
  // relay instead of triggering another refused request.
  // A PIN sign-in never holds a cloud account, so it always takes the relay.
  if (
    (entry.op.table === "stores" || refusedTables.has(entry.op.table) || preferRelay()) &&
    canRelay()
  ) {
    const relayed = await viaRelay(entry.context, entry.op);
    if (relayed.ok) {
      resolveOp(entry.id);
      return true;
    }
    failOp(entry.id, relayed.error ?? "The server could not save this change");
    return false;
  }

  let res = await execute(entry.op);
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
        ...entry.op,
        rows: strip(entry.op.rows, dropped),
      } as SyncOp);
    }
  }
  if (res.error) {
    // A till signed in with a username + PIN has no cloud account, so the row
    // rules refuse the write. Send the very same operation through the server
    // relay, which proves the till and writes on its behalf.
    if (isPermissionError(res.error) && canRelay()) {
      refusedTables.add(entry.op.table);
      const relayed = await viaRelay(entry.context, entry.op);
      if (relayed.ok) {
        resolveOp(entry.id);
        return true;
      }
      failOp(
        entry.id,
        relayed.error
          ? `The central database refused this change and the server relay could not save it either: ${relayed.error}`
          : "The server could not save this change",
      );
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
  if ((op.kind === "upsert" || op.kind === "insert") && res.error?.code === "PGRST204") {
    const named = missingColumn(res.error.message);
    const drop = named ? [named] : (OPTIONAL_COLUMNS[op.table] ?? []);
    if (drop.length) res = await execute({ ...op, rows: strip(op.rows, drop) } as SyncOp);
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
  if (draining || !isOnline() || !isOnlineSyncEnabled() || isTerminalRevoked())
    return { pushed: 0, failed: 0 };
  draining = true;
  setSyncState({ phase: "syncing", pending: listQueue().length });
  let pushed = 0;
  let failed = 0;
  const blocked = new Set<string>();
  try {
    for (const entry of replayOrder(listQueue())) {
      if (entry.quarantined) continue;
      // Branch-level switches: held writes stay queued, never dropped.
      if (!tableSyncAllowed(entry.op.table)) continue;
      const terminal = entry.terminalId ?? "legacy";
      if (blocked.has(terminal)) continue;
      // Exponential backoff: 0s, 5s, 20s, 45s ... since the last attempt.
      const wait = entry.attempts ** 2 * 5000;
      if (wait && Date.now() - new Date(entry.createdAt).getTime() < wait) continue;
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
      ...(pushed && !failed ? { lastSyncAt: new Date().toISOString(), lastError: null } : {}),
    });
  }
  return { pushed, failed };
}

/* ---------------------------- downward sync ---------------------------- */

/** Tables the central database owns; a till only ever reads these back. */
const PULL_TABLES = ["products", "members", "membership_tiers", "promotions", "stores"] as const;

let pulling = false;

/**
 * Bring down everything changed centrally since the last clean pull, so a
 * price edited at head office reaches this till without a restart.
 */
export async function pullDelta(): Promise<{ merged: number }> {
  if (pulling || !isOnline() || !isOnlineSyncEnabled()) return { merged: 0 };
  pulling = true;
  const since = lastSuccessfulPull() ?? "1970-01-01T00:00:00.000Z";
  const startedAt = new Date().toISOString();
  let changed = 0;
  try {
    for (const table of PULL_TABLES) {
      if (!tableSyncAllowed(table)) continue;
      // Only ask how many rows moved; the full refresh below does the reading.
      let { count, error } = await supabaseExternal
        .from(table)
        .select("id", { count: "exact", head: true })
        .gt("updated_at", since);
      if (error)
        ({ count, error } = await supabaseExternal
          .from(table)
          .select("id", { count: "exact", head: true })
          .gt("created_at", since));
      if (error) {
        logSync("pull", table, false, error.message);
        continue;
      }
      if (!count) continue;
      changed += count;
      logSync("pull", table, true, `${count} row(s) changed centrally`);
    }
    // Something moved centrally: refresh the local copy in one consistent read.
    if (changed) {
      writeSnapshot(await loadCloudState());
      window.dispatchEvent(new CustomEvent("pos:cloud-refreshed"));
    }
    setLastSuccessfulPull(startedAt);
    setSyncState({ lastSyncAt: startedAt });
  } catch (e) {
    setSyncState({ lastError: e instanceof Error ? e.message : String(e) });
  } finally {
    pulling = false;
  }
  return { merged: changed };
}

let started = false;

/** Start the background sync loop (called once from the app shell). */
export function startSyncEngine() {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  // Push first, then bring central changes down.
  const tick = () => void drainOutbox().then(() => pullDelta());
  const timer = window.setInterval(tick, 15000);
  const wake = () => {
    setSyncState({ phase: "syncing" });
    tick();
  };
  const sleep = () => setSyncState({ phase: "offline" });
  window.addEventListener("online", wake);
  window.addEventListener("offline", sleep);
  // Flipping the switch back to online catches up immediately instead of
  // waiting for the next timer tick.
  let lastMode = effectiveDatabaseMode();
  const offMode = subscribeDatabaseMode(() => {
    const mode = effectiveDatabaseMode();
    if (mode === lastMode) return;
    lastMode = mode;
    if (mode === "online") wake();
  });
  // The browser's online flag lies on captive networks, so confirm by asking
  // the central database every half minute and resume the moment it answers.
  const ping = window.setInterval(() => {
    if (!navigator.onLine) return;
    void supabaseExternal
      .from("public_flags")
      .select("key")
      .limit(1)
      .then(({ error }) => {
        if (error) return;
        if (syncState().phase === "offline") wake();
      });
  }, 30000);
  tick();
  return () => {
    window.clearInterval(timer);
    window.clearInterval(ping);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", sleep);
    offMode();
    started = false;
  };
}
