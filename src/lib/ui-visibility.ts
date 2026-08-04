/**
 * Admin-controlled screen visibility.
 *
 * The permission matrix decides what a person is *allowed* to do; this decides
 * what they can *see* on the busiest screens. Admins are never hidden from
 * anything, so an accidental toggle can never lock the owner out.
 */
import { useCallback } from "react";
import { usePos } from "./pos-store";
import { useAuth } from "./pos-auth";
import type { StaffRole } from "./permissions";

export type VisibilityRole = Exclude<StaffRole, "admin">;

export const VISIBILITY_ROLES: { id: VisibilityRole; label: string }[] = [
  { id: "cashier", label: "Cashier" },
  { id: "supervisor", label: "Supervisor" },
  { id: "warehouse", label: "Warehouse" },
];

export type VisibilityElement = {
  key: string;
  label: string;
  blurb: string;
  group: string;
};

/** Every element an administrator can hide, grouped by the screen it lives on. */
export const VISIBILITY_ELEMENTS: VisibilityElement[] = [
  {
    key: "register.transactionActions",
    label: "Transaction actions card",
    blurb: "Hold order, void cart, apply coupon and split bill.",
    group: "Register POS",
  },
  {
    key: "register.paymentExecution",
    label: "Payment execution card",
    blurb: "The cash / card / wallet charge buttons deck.",
    group: "Register POS",
  },
  {
    key: "register.exchange",
    label: "Exchange button",
    blurb: "Start an exchange against an earlier bill.",
    group: "Register POS",
  },
  {
    key: "register.coupon",
    label: "Apply coupon",
    blurb: "Coupon entry on the ticket.",
    group: "Register POS",
  },
  {
    key: "register.splitBill",
    label: "Split bill",
    blurb: "Split the balance across several tenders.",
    group: "Register POS",
  },
  {
    key: "register.holdOrder",
    label: "Hold order",
    blurb: "Park the ticket and recall it later.",
    group: "Register POS",
  },
  {
    key: "register.closeShift",
    label: "Close shift button",
    blurb: "Close the shift straight from the register header.",
    group: "Register POS",
  },
  {
    key: "register.customerDisplay",
    label: "Customer display shortcut",
    blurb: "Open the second, customer-facing screen.",
    group: "Register POS",
  },
  {
    key: "sales.receiptHistory",
    label: "Bill search & history",
    blurb: "Look up and reprint earlier bills.",
    group: "Sales & Operations",
  },
  {
    key: "sales.bookings",
    label: "Bookings / pay later",
    blurb: "Deposits, balances and collections.",
    group: "Sales & Operations",
  },
  {
    key: "inventory.costColumns",
    label: "Cost & margin columns",
    blurb: "Cost price, landed cost and margin in inventory tables.",
    group: "Inventory",
  },
  {
    key: "inventory.stockValue",
    label: "Stock value totals",
    blurb: "Money value of stock on hand.",
    group: "Inventory",
  },
];

export const VISIBILITY_GROUPS = Array.from(new Set(VISIBILITY_ELEMENTS.map((e) => e.group)));

export type VisibilityMap = Record<string, string[]>;

/** True when this element should be shown to someone holding `role`. */
export function isVisibleFor(hidden: VisibilityMap, key: string, role: string | null): boolean {
  if (!role || role === "admin") return true;
  return !(hidden[key] ?? []).includes(role);
}

/**
 * `visible("register.holdOrder")` — the one call screens use.
 * Everything is visible until an administrator hides it.
 */
export function useVisibility() {
  const { state, updateSettings } = usePos();
  const { user, isAdmin } = useAuth();
  const hidden = (state.settings.visibility?.hidden ?? {}) as VisibilityMap;
  const role = isAdmin ? "admin" : ((user?.metaRole ?? user?.role ?? "cashier") as string);

  const visible = useCallback(
    (key: string) => isVisibleFor(hidden, key, role),
    [hidden, role],
  );

  const setHidden = useCallback(
    (key: string, forRole: VisibilityRole, hide: boolean) => {
      const current = new Set(hidden[key] ?? []);
      if (hide) current.add(forRole);
      else current.delete(forRole);
      const next: VisibilityMap = { ...hidden, [key]: [...current] };
      if (!next[key].length) delete next[key];
      updateSettings({ visibility: { hidden: next } });
    },
    [hidden, updateSettings],
  );

  return { hidden, role, visible, setHidden };
}
