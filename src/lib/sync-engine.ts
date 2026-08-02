import { supabaseExternal } from "@/integrations/supabase/external-client";
import { logSync } from "./sync-log";
import { replayOrder } from "./activity-journal";
import { isTerminalRevoked } from "./use-revocation-check";
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
  ],
};

const strip = (table: string, rows: Record<string, unknown>[]) =>
  rows.map((r) => {
    const copy = { ...r };
    for (const c of OPTIONAL_COLUMNS[table] ?? []) delete copy[c];
    return copy;
  });

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
    case "insert":
      return from(op.table).insert(op.rows);
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
  let res = await execute(entry.op);
  // PGRST204 = column missing from the schema cache. Retry without the
  // optional branding columns so the core row still saves.
  if (
    res.error?.code === "PGRST204" &&
    (entry.op.kind === "upsert" || entry.op.kind === "insert")
  ) {
    const rows = strip(entry.op.table, entry.op.rows);
    res = await execute({ ...entry.op, rows } as SyncOp);
  }
  if (res.error) {
    failOp(entry.id, res.error.message);
    logSync("push", entry.op.table, false, `${entry.context}: ${res.error.message}`);
    return false;
  }
  resolveOp(entry.id);
  logSync("push", entry.op.table, true, entry.context);
  return true;
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
  if (draining || !isOnline() || !isOnlineSyncEnabled() || isTerminalRevoked())
    return { pushed: 0, failed: 0 };
  draining = true;
  let pushed = 0;
  let failed = 0;
  const blocked = new Set<string>();
  try {
    for (const entry of replayOrder(listQueue())) {
      if (entry.quarantined) continue;
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
  } finally {
    draining = false;
  }
  return { pushed, failed };
}

let started = false;

/** Start the background sync loop (called once from the app shell). */
export function startSyncEngine() {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  const tick = () => void drainOutbox();
  const timer = window.setInterval(tick, 15000);
  window.addEventListener("online", tick);
  tick();
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", tick);
    started = false;
  };
}
