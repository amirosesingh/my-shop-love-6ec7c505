import { useSyncExternalStore } from "react";
import { db } from "./pos-db";

/** Action types — what the person actually did, never a button name. */
export type AuditCategory =
  | "sale"
  | "refund"
  | "booking"
  | "cash"
  | "inventory"
  | "purchasing"
  | "member"
  | "promotion"
  | "staff"
  | "settings"
  | "messaging"
  | "session"
  | "navigation"
  | "interaction"
  | "lookup"
  | "report"
  | "sync";

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "sale", label: "Sale & payment" },
  { value: "refund", label: "Refund & exchange" },
  { value: "booking", label: "Booking & pay later" },
  { value: "cash", label: "Cash drawer & shift" },
  { value: "inventory", label: "Inventory & stock" },
  { value: "purchasing", label: "Purchasing & receiving" },
  { value: "member", label: "Member & loyalty" },
  { value: "promotion", label: "Promotions & pricing" },
  { value: "staff", label: "Staff & permissions" },
  { value: "settings", label: "Settings & configuration" },
  { value: "messaging", label: "Customer messaging" },
  { value: "session", label: "Sign-in & session" },
  { value: "navigation", label: "Moving around the app" },
  { value: "interaction", label: "Screen interaction" },
  { value: "lookup", label: "Search & lookup" },
  { value: "report", label: "Reports & exports" },
  { value: "sync", label: "Data sync" },
];

export const AUDIT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_CATEGORIES.map((c) => [c.value, c.label]),
);

/** Legacy category names still stored in older local logs. */
const LEGACY: Record<string, AuditCategory> = {
  ui_click: "interaction",
  modal: "interaction",
  search: "lookup",
  sale_event: "sale",
  inventory_edit: "inventory",
  member_event: "member",
};

/**
 * Resolves the action type from the action itself, so the trail reads as
 * "what happened" rather than "which control was pressed".
 */
export function resolveCategory(raw: string, action: string): AuditCategory {
  const a = action.toLowerCase();
  if (/refund|exchange|void|return/.test(a)) return "refund";
  if (/booking|pay later|deposit|part payment|collect/.test(a)) return "booking";
  if (/shift|drawer|float|cash count/.test(a)) return "cash";
  if (/whatsapp|message sent|sms/.test(a)) return "messaging";
  if (/sign in|signed in|sign out|login|logout|locked|unlock|override/.test(a)) return "session";
  if (/receiving|purchase order|supplier|barcode scanned/.test(a)) return "purchasing";
  if (/promotion|discount policy|tier/.test(a)) return "promotion";
  if (/staff|permission|role|cashier account/.test(a)) return "staff";
  if (/export|report/.test(a)) return "report";
  if (/bill|sale|payment|receipt printed/.test(a)) return "sale";
  if (/stock|product|inventory|price/.test(a)) return "inventory";
  if (/member|points|loyalty/.test(a)) return "member";
  if (/setting/.test(a)) return "settings";
  if (LEGACY[raw]) return LEGACY[raw]!;
  return (AUDIT_CATEGORY_LABELS[raw] ? (raw as AuditCategory) : "interaction");
}

export type AuditLog = {
  id: string;
  at: string;
  category: AuditCategory;
  action: string;
  module: string;
  staffId: string;
  staffName: string;
  /** role the person held when the action happened */
  role: string;
  storeId: string | null;
  route: string;
  details: Record<string, unknown>;
  synced_to_cloud: boolean;
  syncedAt: string | null;
};

const KEY = "pos-audit-logs-v1";
const MAX = 4000;

let logs: AuditLog[] = [];
let loaded = false;
const listeners = new Set<() => void>();

let actor = {
  staffId: "anonymous",
  staffName: "Unknown",
  role: "unknown",
  storeId: null as string | null,
  authUserId: null as string | null,
};

/** Tell the logger which employee is currently on the terminal. */
export const setAuditActor = (next: Partial<typeof actor>) => {
  actor = { ...actor, ...next };
};

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) logs = JSON.parse(raw) as AuditLog[];
  } catch {
    /* corrupt storage */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(logs.slice(0, MAX)));
  } catch {
    /* storage full */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

/** Global logging utility — every write lands locally first, offline-safe. */
export const logger = {
  log(
    category: string,
    actionName: string,
    module: string,
    details: Record<string, unknown> = {},
  ) {
    if (typeof window === "undefined") return;
    load();
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      category: resolveCategory(category, actionName),
      action: actionName,
      module,
      staffId: actor.staffId,
      staffName: actor.staffName,
      role: actor.role,
      storeId: actor.storeId,
      route: window.location.pathname,
      details: { ...details, role: actor.role, authUserId: actor.authUserId },
      synced_to_cloud: false,
      syncedAt: null,
    };
    logs = [entry, ...logs].slice(0, MAX);
    emit();
    scheduleFlush();
    return entry;
  },
  all() {
    load();
    return logs;
  },
  clear() {
    logs = [];
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/* ---------------- background sync engine ---------------- */

let syncTimer: ReturnType<typeof setInterval> | null = null;
const BATCH = 50;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced push so fresh activity reaches the cloud within seconds. */
function scheduleFlush() {
  if (typeof window === "undefined" || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBatch();
  }, 3000);
}

export type SyncState = { online: boolean; pending: number; lastSyncAt: string | null };

let syncState: SyncState = { online: true, pending: 0, lastSyncAt: null };
const syncListeners = new Set<() => void>();

const setSync = (patch: Partial<SyncState>) => {
  syncState = { ...syncState, ...patch };
  syncListeners.forEach((l) => l());
};

async function flushBatch() {
  load();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const pending = logs.filter((l) => !l.synced_to_cloud);
  setSync({ online, pending: pending.length });
  if (!online || !pending.length) return;

  // Push in batches to the cloud audit_logs table; failures stay pending.
  const slice = pending.slice(0, BATCH);
  let batch: string[];
  try {
    batch = await db.pushAuditLogs(
      slice.map((l) => ({
        id: l.id,
        at: l.at,
        staffName: l.staffName,
        category: AUDIT_CATEGORY_LABELS[l.category] ?? l.category,
        action: l.action,
        module: l.module,
        details: {
          ...l.details,
          route: l.route,
          staffId: l.staffId,
          role: l.role,
          storeId: l.storeId,
        },
      })),
    );
  } catch (e) {
    console.error("[audit] sync failed", e);
    return;
  }
  const at = new Date().toISOString();
  logs = logs.map((l) => (batch.includes(l.id) ? { ...l, synced_to_cloud: true, syncedAt: at } : l));
  emit();
  setSync({ pending: logs.filter((l) => !l.synced_to_cloud).length, lastSyncAt: at });
}

/** Ping every 30s: push pending records when online, stay silent when offline. */
export function startAuditSync() {
  if (typeof window === "undefined" || syncTimer) return;
  load();
  setSync({ pending: logs.filter((l) => !l.synced_to_cloud).length, online: navigator.onLine });
  syncTimer = setInterval(() => void flushBatch(), 30_000);
  window.addEventListener("online", () => {
    setSync({ online: true });
    void flushBatch();
  });
  window.addEventListener("offline", () => setSync({ online: false }));
  void flushBatch();
}

export function useAuditLogs() {
  return useSyncExternalStore(
    logger.subscribe,
    () => logger.all(),
    () => [] as AuditLog[],
  );
}

export function useSyncState() {
  return useSyncExternalStore(
    (fn: () => void) => {
      syncListeners.add(fn);
      return () => syncListeners.delete(fn);
    },
    () => syncState,
    () => syncState,
  );
}

export const auditToCsv = (rows: AuditLog[]) => {
  const head = [
    "Timestamp",
    "Staff Name",
    "Staff ID",
    "Role",
    "Action type",
    "Action",
    "Module",
    "Route",
    "Synced",
    "Details",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      new Date(r.at).toLocaleString(),
      r.staffName,
      r.staffId,
      r.role ?? "",
      AUDIT_CATEGORY_LABELS[r.category] ?? r.category,
      r.action,
      r.module,
      r.route,
      r.synced_to_cloud ? "synced" : "pending",
      JSON.stringify(r.details),
    ]
      .map((v) => esc(String(v)))
      .join(","),
  );
  return [head.map(esc).join(","), ...body].join("\n");
};
