/**
 * Held orders shared across routes.
 *
 * The register used to keep parked tickets in component state, so a bill
 * cancelled from the receipt vault had nowhere to land. Keeping them in one
 * small localStorage-backed store lets the receipts screen push a cancelled
 * bill straight back onto the register's hold list.
 */
import { useEffect, useState } from "react";

import type { CartLine } from "./pos-types";

export type HeldOrder = {
  id: string;
  label: string;
  total: number;
  lines: CartLine[];
  heldAt: string;
  /** set when the entry came from a cancelled bill */
  cancelledFrom?: string;
};

const KEY = "pos.held.orders";
const EVENT = "pos:held-orders-changed";

export function readHeldOrders(): HeldOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HeldOrder[]) : [];
  } catch {
    return [];
  }
}

function write(orders: HeldOrder[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    /* storage full or blocked — the in-memory event still updates the UI */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function setHeldOrders(update: (current: HeldOrder[]) => HeldOrder[]) {
  write(update(readHeldOrders()));
}

export function addHeldOrder(order: HeldOrder) {
  setHeldOrders((hs) => [...hs, order]);
}

export function removeHeldOrder(id: string) {
  setHeldOrders((hs) => hs.filter((h) => h.id !== id));
}

/** Park a cancelled bill so the till can correct and re-ring it. */
export function holdCancelledBill(input: {
  receiptNo: string;
  total: number;
  lines: CartLine[];
}): HeldOrder {
  const order: HeldOrder = {
    id: `C${Date.now()}`,
    label: `Cancelled ${input.receiptNo} · ${input.lines.length} item(s)`,
    total: input.total,
    lines: input.lines.filter((l) => !l.credit),
    heldAt: new Date().toISOString(),
    cancelledFrom: input.receiptNo,
  };
  addHeldOrder(order);
  return order;
}

export function useHeldOrders(): HeldOrder[] {
  const [orders, setOrders] = useState<HeldOrder[]>(() => readHeldOrders());
  useEffect(() => {
    const sync = () => setOrders(readHeldOrders());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return orders;
}
