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
    const message =
      res.error.code === "PGRST205"
        ? `The "${entry.op.table}" table is missing on the database — run supabase/schema14.sql once, then this will sync automatically.`
        : res.error.code === "42501" || /row-level security/i.test(res.error.message)
          ? `This terminal is not allowed to write "${entry.op.table}" on the central database — run supabase/schema17.sql once, then this will sync automatically.`
          : res.error.message;
    failOp(entry.id, message);
    logSync("push", entry.op.table, false, `${entry.context}: ${message}`);
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
