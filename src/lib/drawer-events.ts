import { useSyncExternalStore } from "react";
import { db } from "@/core/api/pos-db";
import { recordActivity } from "./activity-events";

/** Minimum / maximum length of the typed no-sale reason. */
export const NO_SALE_REASON_MIN = 3;
export const NO_SALE_REASON_MAX = 200;

export type DrawerEvent = {
  id: string;
  at: string;
  storeId: string | null;
  terminalId: string | null;
  shiftId: string | null;
  staffId: string;
  staffName: string;
  role: string;
  /** Free-text reason typed by the operator. */
  reason: string;
  note: string;
  /** supervisor who authorised the open when the cashier lacked the right */
  approvedBy: string | null;
};

const KEY = "pos-drawer-events-v1";
const MAX = 2000;

let events: DrawerEvent[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) events = JSON.parse(raw) as DrawerEvent[];
  } catch {
    /* corrupt storage */
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
    } catch {
      /* storage full */
    }
  }
  listeners.forEach((l) => l());
}

/** Records a no-sale drawer open locally first, then pushes it to the cloud. */
export function recordNoSale(input: Omit<DrawerEvent, "id" | "at">) {
  const entry: DrawerEvent = {
    ...input,
    reason: input.reason.trim().slice(0, NO_SALE_REASON_MAX),
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  load();
  events = [entry, ...events].slice(0, MAX);
  emit();
  db.recordDrawerEvent({
    id: entry.id,
    storeId: entry.storeId,
    terminalId: entry.terminalId,
    shiftId: entry.shiftId,
    staffId: entry.staffId,
    staffName: entry.staffName,
    role: entry.role,
    reason: entry.reason,
    note: entry.note || null,
    approvedBy: entry.approvedBy,
    at: entry.at,
  });
  recordActivity({
    type: "drawer_open",
    severity: "warning",
    title: "Cash drawer opened without a sale",
    message: entry.reason + (entry.note ? ` — ${entry.note}` : ""),
    actorId: entry.staffId ?? null,
    actorName: entry.staffName ?? null,
    actorRole: entry.role ?? null,
    terminalId: entry.terminalId ?? null,
    storeId: entry.storeId ?? null,
    entityType: "drawer_event",
    entityId: entry.id,
    meta: { approvedBy: entry.approvedBy ?? null },
  });
  // Filed as a cashier risk action so it shows in the cashier audit trail
  // and in the immutable cloud history.
  void import("./cashier-audit").then(({ logCashierAction }) =>
    logCashierAction({
      actionType: "no_sale",
      storeId: entry.storeId,
      terminalId: entry.terminalId,
      reason: entry.reason + (entry.note ? ` — ${entry.note}` : ""),
      approvedBy: entry.approvedBy,
    }),
  );
  return entry;
}

export const drawerEvents = {
  all() {
    load();
    return events;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useDrawerEvents() {
  return useSyncExternalStore(
    drawerEvents.subscribe,
    () => drawerEvents.all(),
    () => [] as DrawerEvent[],
  );
}