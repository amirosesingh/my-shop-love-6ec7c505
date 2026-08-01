import { useSyncExternalStore } from "react";
import { db } from "./pos-db";

export type AuditCategory =
  | "ui_click"
  | "navigation"
  | "modal"
  | "search"
  | "sale_event"
  | "inventory_edit"
  | "member_event"
  | "settings"
  | "sync";

export const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "ui_click", label: "UI Click" },
  { value: "navigation", label: "Navigation" },
  { value: "modal", label: "Modal" },
  { value: "search", label: "Search" },
  { value: "sale_event", label: "Sale Event" },
  { value: "inventory_edit", label: "Inventory Edit" },
  { value: "member_event", label: "Member & Points" },
  { value: "settings", label: "Settings" },
  { value: "sync", label: "Sync Status" },
];

export type AuditLog = {
  id: string;
  at: string;
  category: AuditCategory;
  action: string;
  module: string;
  staffId: string;
  staffName: string;
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

let actor = { staffId: "anonymous", staffName: "Unknown", storeId: null as string | null };

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
    category: AuditCategory,
    actionName: string,
    module: string,
    details: Record<string, unknown> = {},
  ) {
    if (typeof window === "undefined") return;
    load();
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      category,
      action: actionName,
      module,
      staffId: actor.staffId,
      staffName: actor.staffName,
      storeId: actor.storeId,
      route: window.location.pathname,
      details,
      synced_to_cloud: false,
      syncedAt: null,
    };
    logs = [entry, ...logs].slice(0, MAX);
    emit();
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
        category: l.category,
        action: l.action,
        module: l.module,
        details: { ...l.details, route: l.route, staffId: l.staffId, storeId: l.storeId },
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
    "Category",
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
      r.category,
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
