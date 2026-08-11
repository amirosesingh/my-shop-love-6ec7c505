/**
 * Admin-controlled screen visibility.
 *
 * The permission matrix decides what a person is *allowed* to do; this decides
 * what they can *see* on the busiest screens. Admins are never hidden from
 * anything, so an accidental toggle can never lock the owner out.
 */
import { useCallback } from "react";
import { usePos } from "./pos-store";
import { useAuth } from "@/lib/pos-auth";
import { roleHasTag, type PermissionTag, type StaffRole } from "./permissions";

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
  /** Route this element hides. Set for whole screens such as settings pages. */
  route?: string;
  /** Which roles the screen is meant for at all. */
  tag?: PermissionTag;
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

/** Whole settings pages an administrator can hide from a role. */
export const SETTINGS_VISIBILITY_ELEMENTS: VisibilityElement[] = (
  [
    ["/settings/display", "Display & text size", "Interface scale, density and theme.", "cashier-visible"],
    ["/settings/updates", "Software updates", "App version and background updates.", "admin-only"],
    ["/settings/terminals", "Terminal activation", "Register tills and activation codes.", "admin-only"],
    ["/settings/mobile-terminals", "Mobile terminals", "Phones and tablets running the POS.", "admin-only"],
    ["/settings/sessions", "Active sessions", "Who is signed in, with remote sign-out.", "admin-only"],
    ["/settings/printer", "Receipt printer", "Device, margins, drawer pin, test print.", "cashier-visible"],
    ["/settings/elements", "Receipt elements", "Paper size, logo, points and barcode.", "admin-only"],
    ["/settings/type", "Receipt typography", "Fonts, sizes and spacing on slips.", "admin-only"],
    ["/settings/lines", "Receipt extra lines", "Policy notes and opening hours.", "admin-only"],
    ["/settings/qr", "Receipt QR code", "QR payload, size and placement.", "admin-only"],
    ["/settings/booking-slip", "Booking slip wording", "Terms and the signature line.", "admin-only"],
    ["/settings/identity", "Business identity", "Company name, tax numbers, header.", "admin-only"],
    ["/settings/tax", "Tax & pricing", "Global tax rate and inclusive pricing.", "admin-only"],
    ["/settings/rules", "POS rules & enforcement", "Shift, discount and refund limits.", "admin-only"],
    ["/settings/sku", "SKU numbering", "Automatic product codes.", "inventory-access"],
    ["/settings/numbering", "Bill numbering", "Branch, till and running number.", "admin-only"],
    ["/settings/catalog", "Categories & units", "Category groups and units of measure.", "inventory-access"],
    ["/settings/region", "Region & time", "Country, time zone and clock format.", "admin-only"],
    ["/settings/visibility", "Screen visibility", "What each role can see.", "admin-only"],
    ["/settings/payment", "Bank transfer details", "Bank account and payment QR.", "admin-only"],
    ["/settings/accounts", "Payment accounts", "Card machines, banks and e-wallets.", "admin-only"],
    ["/settings/services", "Booking services", "Jobs and their default fee.", "supervisor-only"],
    ["/settings/whatsapp", "WhatsApp bills", "Send receipts over WhatsApp.", "admin-only"],
    ["/settings/sync", "Sync & backup", "Branch identity, queue and backups.", "admin-only"],
    ["/settings/system", "System status & integrations", "Connection health and public domains.", "admin-only"],
    ["/settings/security-alerts", "Security alerts", "Scan findings and posture checks.", "admin-only"],
    ["/settings/diagnostics", "Database health", "Per-table reading and saving status.", "admin-only"],
    ["/settings/shift-alerts", "Shift alerts", "How the day-end summary is delivered.", "supervisor-only"],
    ["/settings/inheritance", "Settings inheritance", "Global, cluster and branch tiers.", "admin-only"],
  ] as const
).map(([route, label, blurb, tag]) => ({
  key: `route:${route}`,
  label,
  blurb,
  group: "Settings pages",
  route,
  tag: tag as PermissionTag,
}));

VISIBILITY_ELEMENTS.push(...SETTINGS_VISIBILITY_ELEMENTS);

const ROUTE_ELEMENTS = SETTINGS_VISIBILITY_ELEMENTS.filter((e) => e.route);

const roleOf = (role: string | null): StaffRole =>
  role === "admin" || role === "supervisor" || role === "warehouse" ? (role as StaffRole) : "cashier";

/**
 * Can someone holding `role` open `path`? Combines the admin's hidden map with
 * the tag the screen declares. Administrators are never blocked.
 */
export function isRouteVisibleFor(
  hidden: VisibilityMap,
  path: string,
  role: string | null,
): boolean {
  if (!role || role === "admin") return true;
  const match = ROUTE_ELEMENTS.filter(
    (e) => path === e.route || path.startsWith(`${e.route}/`),
  ).sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0))[0];
  if (!match) return true;
  if (match.tag && !roleHasTag(roleOf(role), match.tag)) return false;
  return isVisibleFor(hidden, match.key, role);
}

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
  // Prefer the person's real level so a supervisor can be hidden from a page
  // even though the till treats them as elevated. Only true admins see all.
  const role = ((user?.metaRole ?? (isAdmin ? "admin" : user?.role) ?? "cashier") as string);

  const visible = useCallback(
    (key: string) => isVisibleFor(hidden, key, role),
    [hidden, role],
  );

  const visibleRoute = useCallback(
    (path: string) => isRouteVisibleFor(hidden, path, role),
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

  return { hidden, role, visible, visibleRoute, setHidden };
}
