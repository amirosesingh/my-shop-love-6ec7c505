import type { CartLine, PaymentDetails, PaymentMethod } from "./pos-types";

export const DISPLAY_CHANNEL = "pos-customer-display";
export const DISPLAY_STORAGE_KEY = "pos.display.snapshot";

export type DisplayLine = {
  name: string;
  qty: number;
  price: number;
  lineTotal: number;
  discount: number;
  foc?: boolean;
  credit?: boolean;
};

export type DisplaySnapshot = {
  at: number;
  mode: "idle" | "cart" | "paid" | "booking" | "transfer";
  companyName: string;
  storeName: string;
  cashier: string;
  memberName: string | null;
  memberPoints: number | null;
  lines: DisplayLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** paid / change / balance figures for the "paid" and "booking" modes */
  paid: number;
  change: number;
  balance: number;
  reference: string;
  dueDate: string;
  promos: string[];
  payment: PaymentDetails | null;
  /** tender the cashier has selected, drives the transfer instructions */
  method: PaymentMethod | null;
  /** bank-transfer slip reference typed by the cashier */
  transferRef: string;
};

export const toDisplayLine = (l: CartLine, lineTotal: number): DisplayLine => ({
  name: l.name,
  qty: l.qty,
  price: l.price,
  lineTotal,
  discount: l.discount || 0,
  foc: l.foc,
  credit: l.credit,
});

let channel: BroadcastChannel | null = null;
const chan = () => {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(DISPLAY_CHANNEL);
  return channel;
};

/** Push the latest counter state to any open customer-facing window. */
export function publishDisplay(snapshot: DisplaySnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage full or blocked — the broadcast still works */
  }
  chan()?.postMessage(snapshot);
}

/** Subscribe on the customer screen. Returns an unsubscribe function. */
export function subscribeDisplay(cb: (s: DisplaySnapshot) => void) {
  const c = chan();
  const onMessage = (e: MessageEvent<DisplaySnapshot>) => cb(e.data);
  c?.addEventListener("message", onMessage);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DISPLAY_STORAGE_KEY && e.newValue) {
      try {
        cb(JSON.parse(e.newValue) as DisplaySnapshot);
      } catch {
        /* ignore malformed payloads */
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    c?.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}

export function readDisplaySnapshot(): DisplaySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DisplaySnapshot) : null;
  } catch {
    return null;
  }
}

export function openCustomerDisplay() {
  window.open(
    "/display",
    "pos-customer-display",
    "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no",
  );
}