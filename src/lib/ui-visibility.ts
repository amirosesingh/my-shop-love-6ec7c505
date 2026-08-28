/**
 * Admin-controlled screen visibility.
 *
 * The permission matrix decides what a person is *allowed* to do; this decides
 * what they can *see*. There is no third, hidden layer: whatever an
 * administrator switches here is what the role gets, immediately.
 *
 * The only exception is a small set of owner-only screens (staff, terminals,
 * sync, security, billing identity). Those can never be handed to another role
 * by accident, and are marked `ownerOnly`.
 *
 * Admins are never hidden from anything, so a bad toggle cannot lock the owner
 * out of their own install.
 */
import { useCallback } from "react";
import { usePos } from "./pos-store";
import { useAuth } from "@/lib/pos-auth";
import type { StaffRole } from "./permissions";

export type VisibilityRole = Exclude<StaffRole, "admin">;

export const VISIBILITY_ROLES: { id: VisibilityRole; label: string }[] = [
  { id: "cashier", label: "Cashier" },
  { id: "supervisor", label: "Supervisor" },
  { id: "warehouse", label: "Warehouse" },
];

/**
 * How tightly a screen is locked.
 * - `core`: never grantable — it could hand over the whole install.
 * - `sensitive`: grantable, but hidden from every role until an admin says so.
 * - `none`: an ordinary day-to-day screen, visible unless hidden.
 */
export type VisibilityLock = "core" | "sensitive" | "none";

export type VisibilityElement = {
  key: string;
  label: string;
  blurb: string;
  group: string;
  /** Route this element hides. Set for whole screens such as settings pages. */
  route?: string;
  lock?: VisibilityLock;
  /** Legacy alias: true only for the locked core screens. */
  ownerOnly?: boolean;
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
    route: "/receipts",
  },
  {
    key: "sales.bookings",
    label: "Bookings / pay later",
    blurb: "Deposits, balances and collections.",
    group: "Sales & Operations",
    route: "/bookings",
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

/**
 * Whole settings pages an administrator can hide from a role.
 *
 * The last column marks the pages that stay with the owner whatever the
 * switches say: staff, devices, sync, security, money identity and the access
 * screen itself. Everything else is a day-to-day page that can genuinely be
 * handed to a cashier, supervisor or warehouse user.
 */
export const SETTINGS_VISIBILITY_ELEMENTS: VisibilityElement[] = (
  [
    ["/settings/display", "Display & text size", "Interface scale, density and theme.", false],
    ["/settings/updates", "Software updates", "App version and background updates.", true],
    ["/settings/terminals", "Terminal activation", "Register tills and activation codes.", true],
    ["/settings/mobile-terminals", "Mobile terminals", "Phones and tablets running the POS.", true],
    ["/settings/sessions", "Active sessions", "Who is signed in, with remote sign-out.", true],
    ["/settings/printer", "Receipt printer", "Device, margins, drawer pin, test print.", false],
    ["/settings/elements", "Receipt elements", "Paper size, logo, points and barcode.", false],
    ["/settings/type", "Receipt typography", "Fonts, sizes and spacing on slips.", false],
    ["/settings/lines", "Receipt extra lines", "Policy notes and opening hours.", false],
    ["/settings/qr", "Receipt QR code", "QR payload, size and placement.", false],
    ["/settings/receipt-designer", "Receipt designer", "Lay the slip out visually.", false],
    ["/settings/booking-slip", "Booking slip wording", "Terms and the signature line.", false],
    ["/settings/identity", "Business identity", "Company name, tax numbers, header.", true],
    ["/settings/tax", "Tax & pricing", "Global tax rate and inclusive pricing.", true],
    ["/settings/rules", "POS rules & enforcement", "Shift, discount and refund limits.", true],
    ["/settings/sku", "SKU numbering", "Automatic product codes.", false],
    ["/settings/numbering", "Bill numbering", "Branch, till and running number.", true],
    ["/settings/catalog", "Categories & units", "Category groups and units of measure.", false],
    ["/settings/region", "Region & time", "Country, time zone and clock format.", true],
    ["/settings/visibility", "Roles & access", "What each role may do and see.", true],
    ["/settings/access", "Roles & access", "What each role may do and see.", true],
    ["/settings/payment", "Bank transfer details", "Bank account and payment QR.", true],
    ["/settings/payment-methods", "Payment methods", "Tenders cashiers can collect at checkout.", true],
    ["/settings/accounts", "Payment accounts", "Card machines, banks and e-wallets.", true],
    ["/settings/services", "Booking services", "Jobs and their default fee.", false],
    ["/settings/whatsapp", "WhatsApp bills", "Send receipts over WhatsApp.", true],
    ["/settings/sync", "Sync & backup", "Branch identity, queue and backups.", true],
    ["/settings/system", "System status & integrations", "Connection health and public domains.", true],
    ["/settings/security-alerts", "Security alerts", "Scan findings and posture checks.", true],
    ["/settings/diagnostics", "Database health", "Per-table reading and saving status.", true],
    ["/settings/logic-health", "Logic health", "Relational flow checks.", true],
    ["/settings/database-explorer", "Database explorer", "Browse the local SQL database.", true],
    ["/settings/branch-telemetry", "Branch telemetry", "Heartbeats from every till.", true],
    ["/settings/notifications", "Notifications", "Where alerts are delivered.", true],
    ["/settings/shift-alerts", "Shift alerts", "How the day-end summary is delivered.", false],
    ["/settings/booking-rules", "Booking rules", "Deposits, timing and liability wording.", false],
    ["/settings/hardware", "Hardware", "Scanners, drawers and displays.", false],
    ["/settings/inheritance", "Settings inheritance", "Global, cluster and branch tiers.", true],
  ] as const
).map(([route, label, blurb, ownerOnly]) => ({
  key: `route:${route}`,
  label,
  blurb,
  group: "Settings pages",
  route,
  ownerOnly,
}));

VISIBILITY_ELEMENTS.push(...SETTINGS_VISIBILITY_ELEMENTS);

/** Every element that stands for a whole screen, settings or otherwise. */
const ROUTE_ELEMENTS = VISIBILITY_ELEMENTS.filter((e) => e.route);

/** Screens the owner keeps whatever the switches say. */
export const isOwnerOnlyRoute = (path: string): boolean =>
  !!routeElementFor(path)?.ownerOnly;

function routeElementFor(path: string): VisibilityElement | undefined {
  return ROUTE_ELEMENTS.filter(
    (e) => path === e.route || path.startsWith(`${e.route}/`),
  ).sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0))[0];
}

/**
 * Can someone holding `role` open `path`? Only two things decide it: the
 * owner-only marker, and the switch an administrator set. Administrators are
 * never blocked.
 */
export function isRouteVisibleFor(
  hidden: VisibilityMap,
  path: string,
  role: string | null,
): boolean {
  if (!role || role === "admin") return true;
  const match = routeElementFor(path);
  if (!match) return true;
  if (match.ownerOnly) return false;
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
