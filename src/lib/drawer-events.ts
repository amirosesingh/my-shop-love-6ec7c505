import { useSyncExternalStore } from "react";
import { db } from "./pos-db";
import { logger } from "./audit-log";

/** Why the drawer was opened outside a sale. */
export type NoSaleReason =
  | "change_float"
  | "cash_drop"
  | "petty_cash"
  | "count_check"
  | "mistake"
  | "other";

export const NO_SALE_REASONS: { value: NoSaleReason; label: string }[] = [
  { value: "change_float", label: "Giving change / adding float" },
  { value: "cash_drop", label: "Cash drop to safe" },
  { value: "petty_cash", label: "Petty cash payout" },
  { value: "count_check", label: "Spot count / check" },
  { value: "mistake", label: "Opened by mistake" },
  { value: "other", label: "Other" },
];

export const NO_SALE_LABELS: Record<string, string> = Object.fromEntries(
  NO_SALE_REASONS.map((r) => [r.value, r.label]),
);

export type DrawerEvent = {
  id: string;
  at: string;
  storeId: string | null;
  terminalId: string | null;
  shiftId: string | null;
  staffId: string;
  staffName: string;
  role: string;
  reason: NoSaleReason;
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
  logger.log("cash", "Cash drawer opened without a sale", "register", {
    reason: NO_SALE_LABELS[entry.reason] ?? entry.reason,
    note: entry.note,
    storeId: entry.storeId,
    shiftId: entry.shiftId,
    approvedBy: entry.approvedBy,
  });
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