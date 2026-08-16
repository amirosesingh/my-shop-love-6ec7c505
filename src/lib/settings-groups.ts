/**
 * Unified settings groups.
 *
 * Settings used to be one page per topic, which meant four different places
 * touched "POS rules" and three touched receipts. Each domain now has a single
 * parent view with sub-tabs; the tabs are real routes so deep links, the
 * settings search and the browser back button all keep working.
 */
export type SettingsTab = {
  to: string;
  label: string;
  blurb: string;
  /** Intentionally reachable from two parents — not a duplicate. */
  shared?: boolean;
};

export type SettingsGroup = {
  id: string;
  label: string;
  blurb: string;
  tabs: SettingsTab[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "pos-rules",
    label: "POS rules",
    blurb: "Every transaction, register, tax and cashier policy in one place.",
    tabs: [
      { to: "/settings/rules", label: "Rules & enforcement", blurb: "Shift, discount, refund and terminal limits." },
      { to: "/settings/tax", label: "Tax & pricing", blurb: "Global rate and inclusive or exclusive pricing." },
      { to: "/settings/numbering", label: "Bill numbering", blurb: "Branch, till, date and running number." },
      { to: "/settings/sku", label: "SKU numbering", blurb: "Automatic product codes, or manual entry." },
    ],
  },
  {
    id: "receipts",
    label: "Receipts & printing",
    blurb: "The printer itself and everything that prints on a slip.",
    tabs: [
      { to: "/settings/printer", label: "Printer", blurb: "Device, encoding, margins and drawer pin." },
      { to: "/settings/elements", label: "Elements", blurb: "Paper size, logo, points, barcode, tax." },
      { to: "/settings/type", label: "Typography", blurb: "Fonts, sizes and spacing." },
      { to: "/settings/lines", label: "Extra lines", blurb: "Policy notes, promotions, opening hours." },
      { to: "/settings/qr", label: "QR code", blurb: "Payload, size and placement." },
      { to: "/settings/booking-slip", label: "Booking slip", blurb: "Terms and the signature line.", shared: true },
    ],
  },
  {
    id: "booking-rules",
    label: "Booking rules",
    blurb: "Scheduling, deposits, turnaround and cancellation in one place.",
    tabs: [
      { to: "/settings/booking-rules", label: "Rules & deposits", blurb: "Deposits, turnaround and who may cancel." },
      { to: "/settings/services", label: "Services & fees", blurb: "Re-stringing, repairs and default fees." },
      { to: "/settings/booking-slip", label: "Booking slip", blurb: "Terms and the signature line.", shared: true },
    ],
  },
  {
    id: "system",
    label: "System & general",
    blurb: "Connection health, data sync, security and code health.",
    tabs: [
      { to: "/settings/system", label: "System status", blurb: "Connections, recovery tools and domains." },
      { to: "/settings/diagnostics", label: "Database health", blurb: "Table links, orphan records and read/write checks." },
      { to: "/settings/logic-health", label: "Logic health", blurb: "Unfinished logic, dead actions and missing guards." },
      { to: "/settings/security-alerts", label: "Security alerts", blurb: "Scan findings and posture checks." },
      { to: "/settings/data-sync", label: "Data sync & audit", blurb: "Live sync status and the audit ledger." },
      { to: "/settings/inheritance", label: "Inheritance", blurb: "Global, cluster and branch tiers." },
    ],
  },
];

/** The group a settings route belongs to, if any. */
export function groupForRoute(route: string): SettingsGroup | null {
  return SETTINGS_GROUPS.find((g) => g.tabs.some((t) => t.to === route)) ?? null;
}

export type SettingsDuplicate = {
  route: string;
  groups: string[];
};

/**
 * Any settings page claimed by more than one parent without being marked as a
 * deliberate shortcut. Surfaced in the Logic health dashboard so a future page
 * cannot quietly re-introduce a second home for the same options.
 */
export function settingsDuplicates(): SettingsDuplicate[] {
  const seen = new Map<string, { groups: string[]; shared: boolean }>();
  for (const group of SETTINGS_GROUPS) {
    for (const tab of group.tabs) {
      const entry = seen.get(tab.to) ?? { groups: [], shared: false };
      entry.groups.push(group.label);
      entry.shared = entry.shared || !!tab.shared;
      seen.set(tab.to, entry);
    }
  }
  return [...seen.entries()]
    .filter(([, v]) => v.groups.length > 1 && !v.shared)
    .map(([route, v]) => ({ route, groups: v.groups }));
}