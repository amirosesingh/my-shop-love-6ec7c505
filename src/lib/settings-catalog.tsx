/**
 * One registry for every settings area.
 *
 * Settings used to be described twice — once by the sidebar/hub page and once
 * by the sub-tab strips — which let the same option appear under two different
 * categories. This file is now the single source: the workspace grid, the
 * search box and the half-window sheet all read from it, and each area names
 * exactly one category.
 */
import { lazy, type ComponentType } from "react";
import {
  Activity,
  Building2,
  CalendarClock,
  Database,
  DownloadCloud,
  EyeOff,
  Globe,
  Landmark,
  Layers,
  ListPlus,
  MessageCircle,
  MonitorCog,
  MonitorSmartphone,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Type,
} from "lucide-react";

export type SettingsCategoryId =
  | "business"
  | "products"
  | "payments"
  | "receipts"
  | "bookings"
  | "terminal"
  | "data"
  | "security"
  | "health"
  | "messaging";

/** Heading a category sits under on the settings home page. */
export type SettingsGroupId = "business" | "sales" | "terminal" | "admin";

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "sales", label: "Sales & customer experience" },
  { id: "terminal", label: "Terminal" },
  { id: "admin", label: "Security & administration" },
];

/** Where a change made on this page applies. A label only. */
export type SettingsScope = "company" | "branch" | "terminal";

export const SCOPE_LABEL: Record<SettingsScope, string> = {
  company: "Company",
  branch: "Branch",
  terminal: "This terminal",
};

export type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  blurb: string;
  group: SettingsGroupId;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "business",
    label: "Business",
    blurb: "Who you are, what you charge and how documents are numbered.",
    group: "business",
  },
  {
    id: "products",
    label: "Products & inventory",
    blurb: "Categories, units and the codes products are given.",
    group: "business",
  },
  {
    id: "payments",
    label: "Payments",
    blurb: "What customers can pay with and where the money lands.",
    group: "sales",
  },
  {
    id: "receipts",
    label: "Receipts & printing",
    blurb: "The printer and everything printed on a slip.",
    group: "sales",
  },
  {
    id: "bookings",
    label: "Bookings & services",
    blurb: "Job cards, deposits, turnaround and the slip the customer signs.",
    group: "sales",
  },
  {
    id: "messaging",
    label: "Messaging",
    blurb: "How bills and alerts reach the customer.",
    group: "sales",
  },
  {
    id: "terminal",
    label: "Terminal",
    blurb: "This machine: screen, hardware, updates and its identity.",
    group: "terminal",
  },
  {
    id: "data",
    label: "Data & connectivity",
    blurb: "Company connection, local database and keeping them in step.",
    group: "terminal",
  },
  {
    id: "security",
    label: "Staff & security",
    blurb: "Who may do what, and what each role can see.",
    group: "admin",
  },
  {
    id: "health",
    label: "System health",
    blurb: "Status checks, alerts and support tools.",
    group: "admin",
  },
];

export type SettingsCard = {
  id: string;
  label: string;
  blurb: string;
  icon: typeof MonitorCog;
  category: SettingsCategoryId;
  /** Where the change applies — shown as a chip on the page header. */
  scope?: SettingsScope;
  /** Full-page fallback, and the deep link shown inside the sheet. */
  to: string;
  /** Panel mounted inside the sheet. */
  panel: ComponentType;
  /**
   * True when `panel` is a bare panel rather than a settings page, so the sheet
   * has to supply the surrounding frame (save bar, shared settings context).
   */
  raw?: boolean;
  /** Managed in the web console only — hidden in the Windows desktop build. */
  cloudOnly?: boolean;
  /**
   * Needs the local database engine — hidden on web and phone, which work
   * live against the central database and have nothing local to inspect.
   */
  desktopOnly?: boolean;
  /** Extra words the search box should match. */
  keywords?: string;
};

/** Route components already contain their own `SettingsFrame`. */
const page = (load: () => Promise<{ Route: { options: { component?: unknown } } }>) =>
  lazy(async () => ({ default: (await load()).Route.options.component as ComponentType }));

export const SETTINGS_CARDS: SettingsCard[] = [
  /* ---- Terminal --------------------------------------------- */
  {
    id: "display",
    label: "Display & text size",
    blurb: "Interface scale, density and light / dark theme.",
    icon: MonitorCog,
    category: "terminal",
    scope: "terminal",
    to: "/settings/display",
    panel: page(() => import("@/routes/settings.display")),
    keywords: "font scaling zoom theme dark light",
  },
  {
    id: "updates",
    label: "Software updates",
    blurb: "App version, background updates and system health.",
    icon: DownloadCloud,
    category: "terminal",
    scope: "terminal",
    to: "/settings/updates",
    panel: page(() => import("@/routes/settings.updates")),
    keywords: "version upgrade rollback",
  },
  {
    id: "hardware",
    label: "Hardware & cash drawer",
    blurb: "Printer, drawer and device identity for this machine only.",
    icon: Printer,
    category: "terminal",
    scope: "terminal",
    to: "/settings/hardware",
    panel: page(() => import("@/routes/settings.hardware")),
    keywords: "local only device kick pin",
  },
  {
    id: "terminals",
    label: "Terminal activation",
    blurb: "Register Windows tills, issue and revoke activation codes.",
    icon: MonitorSmartphone,
    category: "terminal",
    scope: "company",
    to: "/settings/terminals",
    panel: page(() => import("@/routes/settings.terminals")),
    cloudOnly: true,
    keywords: "token pair activate revoke",
  },
  {
    id: "mobile-terminals",
    label: "Mobile terminals",
    blurb: "Phones and tablets running the POS, managed separately.",
    icon: Smartphone,
    category: "terminal",
    scope: "company",
    to: "/settings/mobile-terminals",
    panel: page(() => import("@/routes/settings.mobile-terminals")),
    cloudOnly: true,
    keywords: "android tablet qr pairing",
  },
  {
    id: "sessions",
    label: "Active sessions",
    blurb: "Everyone signed in right now, with instant remote sign-out.",
    icon: MonitorSmartphone,
    category: "terminal",
    scope: "company",
    to: "/settings/sessions",
    panel: page(() => import("@/routes/settings.sessions")),
    cloudOnly: true,
    keywords: "logged in kick out device",
  },

  /* ---- Receipts & printing -------------------------------------------- */
  {
    id: "printer",
    label: "Receipt printer",
    blurb: "Device, encoding, margins, drawer pin and a test print.",
    icon: Printer,
    category: "receipts",
    scope: "terminal",
    to: "/settings/printer",
    panel: page(() => import("@/routes/settings.printer")),
    keywords: "thermal escpos 58mm 80mm",
  },
  {
    id: "elements",
    label: "Receipt elements",
    blurb: "Paper size, logo, points, barcode and tax blocks.",
    icon: ReceiptText,
    category: "receipts",
    scope: "company",
    to: "/settings/elements",
    panel: page(() => import("@/routes/settings.elements")),
  },
  {
    id: "type",
    label: "Receipt typography",
    blurb: "Fonts, sizes and spacing for printed slips.",
    icon: Type,
    category: "receipts",
    scope: "company",
    to: "/settings/type",
    panel: page(() => import("@/routes/settings.type")),
  },
  {
    id: "lines",
    label: "Receipt extra lines",
    blurb: "Policy notes, promotions and opening hours.",
    icon: ListPlus,
    category: "receipts",
    scope: "company",
    to: "/settings/lines",
    panel: page(() => import("@/routes/settings.lines")),
  },
  {
    id: "receipt-designer",
    label: "Receipt designer",
    blurb: "Dynamic fields, logo upload and scoped receipt CSS.",
    icon: ListPlus,
    category: "receipts",
    scope: "company",
    to: "/settings/receipt-designer",
    panel: page(() => import("@/routes/settings.receipt-designer")),
    keywords: "template css logo fields variables",
  },
  {
    id: "qr",
    label: "Receipt QR code",
    blurb: "QR payload, size and placement on the slip.",
    icon: QrCode,
    category: "receipts",
    scope: "company",
    to: "/settings/qr",
    panel: page(() => import("@/routes/settings.qr")),
  },

  /* ---- Business, products --------------------------------------------- */
  {
    id: "identity",
    label: "Business identity & logo",
    blurb: "Company name, tax numbers, logo, header and footer.",
    icon: Building2,
    category: "business",
    scope: "company",
    to: "/settings/identity",
    panel: page(() => import("@/routes/settings.identity")),
    keywords: "branding company name png",
  },
  {
    id: "groups",
    label: "Groups & clusters",
    blurb: "The groups your branches and warehouses belong to.",
    icon: Layers,
    category: "business",
    scope: "company",
    to: "/settings/groups",
    panel: page(() => import("@/routes/settings.groups")),
    cloudOnly: true,
    keywords: "cluster group division apparel trophy branch grouping",
  },
  {
    id: "tax",
    label: "Tax & pricing",
    blurb: "Global tax rate and inclusive or exclusive pricing.",
    icon: ReceiptText,
    category: "business",
    scope: "company",
    to: "/settings/tax",
    panel: page(() => import("@/routes/settings.tax")),
    keywords: "vat gst",
  },
  {
    id: "rules",
    label: "POS rules & enforcement",
    blurb: "Shift, discount, refund and terminal security limits.",
    icon: ShieldCheck,
    category: "business",
    scope: "company",
    to: "/settings/rules",
    panel: page(() => import("@/routes/settings.rules")),
  },
  {
    id: "sku",
    label: "SKU numbering",
    blurb: "Automatic running-number product codes, or manual entry.",
    icon: ScanBarcode,
    category: "products",
    scope: "company",
    to: "/settings/sku",
    panel: page(() => import("@/routes/settings.sku")),
  },
  {
    id: "numbering",
    label: "Bill numbering",
    blurb: "Branch, till, date and running number on every receipt.",
    icon: ReceiptText,
    category: "business",
    scope: "branch",
    to: "/settings/numbering",
    panel: page(() => import("@/routes/settings.numbering")),
  },
  {
    id: "stock-numbering",
    label: "Document numbering",
    blurb: "Reference numbers for stock counts and goods received.",
    icon: ListPlus,
    category: "business",
    scope: "branch",
    to: "/settings/stock-numbering",
    panel: page(() => import("@/routes/settings.stock-numbering")),
    keywords: "stock count reference goods received prefix padding reset",
  },
  {
    id: "catalog",
    label: "Categories & units",
    blurb: "Category groups, sub-categories and units of measure.",
    icon: ScanBarcode,
    category: "products",
    scope: "company",
    to: "/settings/catalog",
    panel: page(() => import("@/routes/settings.catalog")),
  },
  {
    id: "region",
    label: "Region & time",
    blurb: "Country, time zone, date order and 12 / 24-hour clock.",
    icon: Globe,
    category: "business",
    scope: "company",
    to: "/settings/region",
    panel: page(() => import("@/routes/settings.region")),
  },

  /* ---- Payments & messaging ------------------------------------------- */
  {
    id: "payment-methods",
    label: "Payment methods & vouchers",
    blurb: "Tenders cashiers can collect, including voucher redemptions.",
    icon: Landmark,
    category: "payments",
    scope: "company",
    to: "/settings/payment-methods",
    panel: page(() => import("@/routes/settings.payment-methods")),
  },
  {
    id: "payment",
    label: "Bank transfer details",
    blurb: "Bank account and payment QR for the customer display.",
    icon: Landmark,
    category: "payments",
    scope: "company",
    to: "/settings/payment",
    panel: page(() => import("@/routes/settings.payment")),
  },
  {
    id: "accounts",
    label: "Payment accounts",
    blurb: "Card machines, bank accounts and e-wallets cashiers can pick.",
    icon: Landmark,
    category: "payments",
    scope: "company",
    to: "/settings/accounts",
    panel: page(() => import("@/routes/settings.accounts")),
  },
  {
    id: "whatsapp",
    label: "WhatsApp bills & integrations",
    blurb: "Send receipts over the WhatsApp Cloud API.",
    icon: MessageCircle,
    category: "messaging",
    scope: "company",
    to: "/settings/whatsapp",
    panel: page(() => import("@/routes/settings.whatsapp")),
  },

  /* ---- Bookings & services --------------------------------------------- */
  {
    id: "booking-rules",
    label: "Booking rules & deposits",
    blurb: "Deposits, turnaround, racket jobs and who may cancel.",
    icon: CalendarClock,
    category: "bookings",
    scope: "company",
    to: "/settings/booking-rules",
    panel: page(() => import("@/routes/settings.booking-rules")),
  },
  {
    id: "services",
    label: "Booking services & fees",
    blurb: "Re-stringing, repairs and other jobs with their default fee.",
    icon: CalendarClock,
    category: "bookings",
    scope: "company",
    to: "/settings/services",
    panel: page(() => import("@/routes/settings.services")),
  },
  {
    id: "booking-slip",
    label: "Booking slip wording",
    blurb: "Terms & conditions and the customer signature line.",
    icon: ReceiptText,
    category: "bookings",
    scope: "company",
    to: "/settings/booking-slip",
    panel: page(() => import("@/routes/settings.booking-slip")),
  },

  /* ---- Data & connectivity ----------------------------------------------------- */
  {
    id: "sync",
    label: "Sync",
    blurb: "Run a sync, watch each table and clear the queue.",
    icon: RefreshCw,
    category: "data",
    scope: "terminal",
    to: "/settings/sync",
    panel: page(() => import("@/routes/settings.sync")),
  },
  {
    id: "database",
    label: "Database connection",
    blurb: "Central and local database connections, tests and schema health.",
    icon: Database,
    category: "data",
    scope: "terminal",
    to: "/settings/database",
    panel: page(() => import("@/routes/settings.database")),
  },
  {
    id: "data-sync",
    label: "Data sync & audit",
    blurb: "Every push and pull between this till and the company data.",
    icon: RefreshCw,
    category: "data",
    scope: "terminal",
    to: "/settings/system?tab=data-sync",
    raw: true,
    desktopOnly: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/sync/SyncHub")).SyncHub,
    })),
  },
  {
    id: "shift-alerts",
    label: "Shift alerts",
    blurb: "How the day-end summary reaches this device.",
    icon: Activity,
    category: "messaging",
    scope: "branch",
    to: "/settings/shift-alerts",
    panel: page(() => import("@/routes/settings.shift-alerts")),
  },
  {
    id: "notifications",
    label: "Notification delivery",
    blurb: "Which events raise an alert and how they are delivered.",
    icon: MessageCircle,
    category: "messaging",
    scope: "company",
    to: "/settings/notifications",
    panel: page(() => import("@/routes/settings.notifications")),
  },
  {
    id: "branch-telemetry",
    label: "Branch telemetry centre",
    blurb: "Live health of every till, with remote data-only sync requests.",
    icon: MonitorSmartphone,
    category: "health",
    scope: "company",
    to: "/settings/branch-telemetry",
    panel: page(() => import("@/routes/settings.branch-telemetry")),
    cloudOnly: true,
  },

  /* ---- System health -------------------------------------------- */
  {
    id: "system",
    label: "System status",
    blurb: "Connections, recovery tools and domains.",
    icon: Activity,
    category: "health",
    scope: "terminal",
    to: "/settings/system?tab=system",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/settings/panels/SystemStatusPanel"))
        .SystemStatusPanel,
    })),
  },
  {
    id: "database-health",
    label: "Database health",
    blurb: "Table links, orphan records and read / write checks.",
    icon: Database,
    category: "health",
    scope: "terminal",
    to: "/settings/system?tab=database-health",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/settings/panels/DatabaseHealthPanel"))
        .DatabaseHealthPanel,
    })),
  },
  {
    id: "logic-health",
    label: "Logic health",
    blurb: "Unfinished logic, dead actions and missing guards.",
    icon: ShieldCheck,
    category: "health",
    scope: "company",
    to: "/settings/system?tab=logic-health",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/settings/panels/LogicHealthPanel")).LogicHealthPanel,
    })),
  },
  {
    id: "security-alerts",
    label: "Security alerts",
    blurb: "Findings raised by the security scanner, with acknowledgement.",
    icon: ShieldCheck,
    category: "health",
    scope: "company",
    to: "/settings/system?tab=security-alerts",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/settings/panels/SecurityAlertsPanel"))
        .SecurityAlertsPanel,
    })),
  },
  {
    id: "data-comparison",
    label: "Server vs. shop data",
    blurb: "Record counts here against the company server.",
    icon: Database,
    category: "data",
    scope: "branch",
    to: "/settings/system?tab=data-comparison",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/sync/DataComparison")).DataComparison,
    })),
  },
  {
    id: "inheritance",
    label: "Settings inheritance",
    blurb: "Which values come from global, cluster or this branch.",
    icon: Building2,
    category: "data",
    scope: "company",
    to: "/settings/system?tab=inheritance",
    raw: true,
    panel: lazy(async () => ({
      default: (await import("@/platforms/web/components/pos/settings/panels/InheritancePanel")).InheritancePanel,
    })),
  },
  {
    id: "database-explorer",
    label: "Database explorer",
    blurb: "Browse the SQL Server on this machine and run read-only checks.",
    icon: Database,
    category: "data",
    scope: "terminal",
    to: "/settings/database-explorer",
    panel: page(() => import("@/routes/settings.database-explorer")),
    desktopOnly: true,
  },

  /* ---- Staff & security --------------------------------------------- */
  {
    id: "access",
    label: "Roles & access",
    blurb: "One page: what each role may do, and what it can see.",
    icon: EyeOff,
    category: "security",
    scope: "company",
    to: "/settings/access",
    panel: page(() => import("@/routes/settings.access")),
  },
];

/** Fallback quick access, used until someone pins their own shortcuts. */
export const PINNED_SETTINGS = [
  "identity",
  "branch-telemetry",
  "hardware",
  "payment-methods",
  "whatsapp",
  "system",
];

export function settingsCard(id: string | undefined | null): SettingsCard | null {
  if (!id) return null;
  return SETTINGS_CARDS.find((c) => c.id === id) ?? null;
}

/** Same option in two categories would be a navigation bug — surfaced in Logic health. */
export function settingsCatalogDuplicates(): string[] {
  const seen = new Map<string, number>();
  for (const card of SETTINGS_CARDS) seen.set(card.to, (seen.get(card.to) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([to]) => to);
}
