/**
 * Persisted register draft.
 *
 * The open ticket must survive a page refresh, a route change or an app
 * restart — it only disappears when the cashier clears/voids it, takes
 * payment, or holds/books the order.
 *
 * Android keeps it too, in device storage rather than sessionStorage: the
 * system reclaims the app whenever the camera opens for a barcode scan, and
 * sessionStorage does not survive that, so the cashier would come back to an
 * empty basket. It is the only business key the phone persists, it never
 * leaves the device, and it is removed as soon as the ticket is settled.
 */
import type { CartLine, DiscountType } from "@/core/types/pos-types";

export type CartDraft = {
  lines: CartLine[];
  cartDiscount: number;
  cartDiscountType: DiscountType;
  exchangeRef: string | null;
  memberId: string | null;
  coupon: unknown;
  /** bill number reserved for this ticket */
  billNo?: string | null;
};

const key = (storeId: string) => `pos.cart.draft.${storeId}`;

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadCartDraft(storeId: string): CartDraft | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CartDraft>;
    if (!Array.isArray(parsed.lines)) return null;
    return {
      lines: parsed.lines as CartLine[],
      cartDiscount: Number(parsed.cartDiscount) || 0,
      cartDiscountType: parsed.cartDiscountType === "percent" ? "percent" : "amount",
      exchangeRef: parsed.exchangeRef ?? null,
      memberId: parsed.memberId ?? null,
      coupon: parsed.coupon ?? null,
      billNo: parsed.billNo ?? null,
    };
  } catch {
    return null;
  }
}

export function saveCartDraft(storeId: string, draft: CartDraft) {
  const s = store();
  if (!s) return;
  try {
    if (!draft.lines.length && !draft.memberId && !draft.exchangeRef) {
      s.removeItem(key(storeId));
      return;
    }
    s.setItem(key(storeId), JSON.stringify(draft));
  } catch {
    /* storage full or blocked — the ticket still works in memory */
  }
}

export function clearCartDraft(storeId: string) {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key(storeId));
  } catch {
    /* ignore */
  }
}