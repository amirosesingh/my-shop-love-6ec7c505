/**
 * Activity notifications.
 *
 * One feed of "something happened" events — sign-ins, shifts, sales, refunds,
 * drawer opens, stock and staff changes. Admins see them in the header bell and
 * on the notifications report; selected types are also messaged on WhatsApp.
 *
 * Recording is fire-and-forget: it must never slow down or block the person
 * performing the action. When the till is offline the event is parked locally
 * and flushed on the next successful write.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { pushActivityEvent } from "./activity-events.functions";
import { readCredentials } from "./pos-credentials";

export type EventSeverity = "info" | "warning" | "critical";

export type ActivityEventInput = {
  type: string;
  severity?: EventSeverity;
  title: string;
  message?: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  terminalId?: string | null;
  terminalName?: string | null;
  storeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number | null;
  meta?: Record<string, unknown>;
};

export type ActivityEvent = {
  id: string;
  type: string;
  severity: EventSeverity;
  title: string;
  message: string;
  actorName: string;
  actorRole: string;
  terminalName: string;
  storeId: string;
  entityType: string;
  entityId: string;
  amount: number | null;
  whatsappStatus: string;
  createdAt: string;
};

/** Every event the till can raise, grouped for the settings matrix. */
export const EVENT_CATALOG: { group: string; types: { type: string; label: string }[] }[] = [
  {
    group: "Sign in & security",
    types: [
      { type: "sign_in", label: "Someone signs in" },
      { type: "sign_out", label: "Someone signs out" },
      { type: "sign_in_failed", label: "Failed PIN or password attempt" },
      { type: "account_locked", label: "Account locked after repeated failures" },
      { type: "terminal_activated", label: "Terminal activated" },
      { type: "terminal_unpaired", label: "Terminal unpaired" },
    ],
  },
  {
    group: "Shifts & cash",
    types: [
      { type: "shift_open", label: "Shift opened" },
      { type: "shift_close", label: "Shift closed" },
      { type: "xreport_print", label: "X-report printed" },
      { type: "drawer_open", label: "Cash drawer opened by hand" },
    ],
  },
  {
    group: "Selling",
    types: [
      { type: "sale_complete", label: "Sale completed" },
      { type: "sale_refund", label: "Refund issued" },
      { type: "sale_void", label: "Bill voided" },
      { type: "discount_override", label: "Large manual discount" },
    ],
  },
  {
    group: "Stock & purchasing",
    types: [
      { type: "stock_adjust", label: "Stock adjusted" },
      { type: "transfer_sent", label: "Transfer sent" },
      { type: "transfer_received", label: "Transfer received" },
      { type: "po_finalised", label: "Purchase order finalised" },
    ],
  },
  {
    group: "People",
    types: [
      { type: "staff_created", label: "Staff account created" },
      { type: "staff_updated", label: "Staff account edited" },
      { type: "staff_deactivated", label: "Staff account deactivated" },
      { type: "role_changed", label: "Role or permissions changed" },
    ],
  },
];

export const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_CATALOG.flatMap((g) => g.types.map((t) => [t.type, t.label] as const)),
);

export const SEVERITY_TONE: Record<EventSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-border bg-surface-2 text-muted-foreground",
};

/* ---------------------------------------------------------------- offline */

const QUEUE_KEY = "pos.activity.queue.v1";
const isBrowser = () => typeof window !== "undefined";

type Queued = ActivityEventInput & { clientEventId: string; createdAt: string };

function readQueue(): Queued[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

function writeQueue(rows: Queued[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-500)));
  } catch {
    /* storage full — the till keeps selling */
  }
}

async function send(entry: Queued): Promise<boolean> {
  try {
    // The server refuses events it cannot attribute, so the device's proof
    // travels with every one. Before sign-in the event simply waits in the
    // local queue and is flushed once there is a session.
    const credentials = await readCredentials();
    const res = await pushActivityEvent({ data: { ...entry, ...credentials } });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Keep the event on this till when the cloud cannot be reached.
 *
 * The browser queue survives a reload but not a wipe, so on a terminal with
 * its own database the event is written there instead and pushed by the sync
 * worker like a sale. Returns true when the row is safely stored.
 */
async function park(entry: Queued): Promise<boolean> {
  const { parkGovernanceRow } = await import("./governance-offline");
  const res = await parkGovernanceRow("activity_events", {
    id: entry.clientEventId,
    client_event_id: entry.clientEventId,
    event_type: entry.type,
    severity: entry.severity ?? "info",
    title: entry.title,
    message: entry.message ?? "",
    actor_id: entry.actorId ?? null,
    actor_name: entry.actorName ?? null,
    actor_role: entry.actorRole ?? null,
    terminal_id: entry.terminalId ?? null,
    terminal_name: entry.terminalName ?? null,
    store_id: entry.storeId ?? null,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    amount: entry.amount ?? null,
    meta: entry.meta ?? {},
    whatsapp_status: "skipped",
    created_at: entry.createdAt,
  });
  return res.parked;
}

/** Retry anything that could not reach the cloud earlier. */
export async function flushActivityQueue(): Promise<void> {
  const rows = readQueue();
  if (rows.length === 0) return;
  const left: Queued[] = [];
  for (const row of rows) {
    if (!(await send(row))) left.push(row);
  }
  writeQueue(left);
}

/** Raise an event. Never throws, never blocks the caller. */
export function recordActivity(input: ActivityEventInput): void {
  const entry: Queued = {
    ...input,
    severity: input.severity ?? "info",
    clientEventId: isBrowser() && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  void (async () => {
    if (await send(entry)) {
      void flushActivityQueue();
      return;
    }
    // Offline: the till's own database keeps it if there is one, otherwise
    // the browser queue holds it until the line is back.
    if (await park(entry)) return;
    writeQueue([...readQueue(), entry]);
  })();
}

export const pendingActivityCount = () => readQueue().length;

/* ------------------------------------------------------------------ reads */

type Row = Record<string, unknown>;

function map(row: Row): ActivityEvent {
  return {
    id: String(row["id"] ?? ""),
    type: String(row["event_type"] ?? ""),
    severity: (row["severity"] as EventSeverity) ?? "info",
    title: String(row["title"] ?? ""),
    message: String(row["message"] ?? ""),
    actorName: String(row["actor_name"] ?? ""),
    actorRole: String(row["actor_role"] ?? ""),
    terminalName: String(row["terminal_name"] ?? row["terminal_id"] ?? ""),
    storeId: String(row["store_id"] ?? ""),
    entityType: String(row["entity_type"] ?? ""),
    entityId: String(row["entity_id"] ?? ""),
    amount: row["amount"] === null || row["amount"] === undefined ? null : Number(row["amount"]),
    whatsappStatus: String(row["whatsapp_status"] ?? "skipped"),
    createdAt: String(row["created_at"] ?? ""),
  };
}

export type ActivityFilter = {
  types?: string[];
  severities?: EventSeverity[];
  storeId?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
};

/**
 * Older databases predate the activity feed. When the table is absent every
 * poll would log a 404, so the first miss switches the feature off for the
 * session and the UI shows a short "run the setup file" hint instead.
 */
let logMissing = false;

export const isActivityLogMissing = () => logMissing;

const looksMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "PGRST205" ||
    error.code === "42P01" ||
    /activity_events/i.test(error.message ?? "") ||
    /schema cache|does not exist/i.test(error.message ?? ""));

/** Newest first. Returns [] when the caller is not an admin or supervisor. */
export async function listActivityEvents(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  if (logMissing) return [];
  let q = supabase
    .from("activity_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.types?.length) q = q.in("event_type", filter.types);
  if (filter.severities?.length) q = q.in("severity", filter.severities);
  if (filter.storeId) q = q.eq("store_id", filter.storeId);
  if (filter.actor) q = q.ilike("actor_name", `%${filter.actor}%`);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);
  const { data, error } = await q;
  if (error) {
    if (looksMissing(error)) logMissing = true;
    return [];
  }
  return ((data ?? []) as Row[]).map(map);
}

/* ------------------------------------------------------------ read marker */

const SEEN_KEY = "pos.activity.seen";

export function lastSeenAt(): string {
  if (!isBrowser()) return "";
  return window.localStorage.getItem(SEEN_KEY) ?? "";
}

export function markActivitySeen(stamp = new Date().toISOString()) {
  if (!isBrowser()) return;
  window.localStorage.setItem(SEEN_KEY, stamp);
}

/** Rows raised since the admin last opened the bell. */
export const unseenEvents = (rows: ActivityEvent[]): ActivityEvent[] => {
  const seen = lastSeenAt();
  return seen ? rows.filter((r) => r.createdAt > seen) : rows;
};

export function toCsv(rows: ActivityEvent[]): string {
  const head = [
    "When",
    "Type",
    "Severity",
    "Title",
    "Message",
    "Person",
    "Role",
    "Terminal",
    "Branch",
    "Amount",
    "WhatsApp",
  ];
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const body = rows.map((r) =>
    [
      r.createdAt,
      EVENT_LABELS[r.type] ?? r.type,
      r.severity,
      r.title,
      r.message,
      r.actorName,
      r.actorRole,
      r.terminalName,
      r.storeId,
      r.amount ?? "",
      r.whatsappStatus,
    ]
      .map(cell)
      .join(","),
  );
  return [head.map(cell).join(","), ...body].join("\n");
}
/* ------------------------------------------------------- cleared entries */

/**
 * Clearing an entry hides it for the person who cleared it. The event, the
 * approval request and the authorisation log are untouched — anything cleared
 * can be reopened from the Cleared tab.
 */
const CLEARED_KEY = "pos.activity.cleared";

type ClearedMap = Record<string, string[]>;

function readClearedMap(): ClearedMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(CLEARED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as ClearedMap) : {};
  } catch {
    return {};
  }
}

function writeClearedMap(map: ClearedMap) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CLEARED_KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — clearing is only a view preference */
  }
  window.dispatchEvent(new CustomEvent("pos:activity-cleared-changed"));
}

const who = (userId: string) => (userId || "anon").toLowerCase();

export const clearedIds = (userId: string): string[] => readClearedMap()[who(userId)] ?? [];

export function clearActivityEntry(userId: string, id: string) {
  const map = readClearedMap();
  const key = who(userId);
  const list = map[key] ?? [];
  if (!list.includes(id)) map[key] = [...list, id].slice(-500);
  writeClearedMap(map);
}

export function reopenActivityEntry(userId: string, id: string) {
  const map = readClearedMap();
  const key = who(userId);
  map[key] = (map[key] ?? []).filter((x) => x !== id);
  writeClearedMap(map);
}

export const isCleared = (userId: string, id: string): boolean =>
  clearedIds(userId).includes(id);
