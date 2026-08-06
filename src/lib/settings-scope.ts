/**
 * Registry for settings that resolve through the Global → Cluster → Branch
 * hierarchy.
 *
 * Both the server resolver and the UI read this one list, so adding a
 * hierarchical setting is a single entry here. Values are stored as JSON in
 * `settings_scoped`; a scope only stores a row for keys it actually overrides.
 */

export type SettingScope = "GLOBAL" | "CLUSTER" | "BRANCH";

export type SettingValue = string | number | boolean;

export type SettingCategory = "device" | "inventory" | "system";

export type SettingDef = {
  key: string;
  label: string;
  blurb: string;
  kind: "boolean" | "number" | "text";
  category: SettingCategory;
  /** Tier this setting is normally maintained at. */
  tier: SettingScope;
  fallback: SettingValue;
  /** Hide the value behind dots in the UI (API keys and similar). */
  secret?: boolean;
};

export const SETTING_CATEGORIES: {
  id: SettingCategory;
  label: string;
  blurb: string;
  tier: SettingScope;
}[] = [
  {
    id: "device",
    label: "Device & hardware",
    blurb: "Printers, drawers and terminal identity. Branch-specific by default.",
    tier: "BRANCH",
  },
  {
    id: "inventory",
    label: "Inventory & operational rules",
    blurb: "Stock sync, thresholds and transfer approvals. Cluster-synced by default.",
    tier: "CLUSTER",
  },
  {
    id: "system",
    label: "System & integration rules",
    blurb: "Currency, base permissions and API keys. Global by default.",
    tier: "GLOBAL",
  },
];

export const SETTING_DEFS: SettingDef[] = [
  /* ---------- device & hardware (branch scope) ---------- */
  {
    key: "printer_name",
    label: "Receipt printer",
    blurb: "Windows printer name or USB device this till prints to.",
    kind: "text",
    category: "device",
    tier: "BRANCH",
    fallback: "",
  },
  {
    key: "printer_ip",
    label: "Printer IP address",
    blurb: "Network printer address, if the till prints over LAN.",
    kind: "text",
    category: "device",
    tier: "BRANCH",
    fallback: "",
  },
  {
    key: "printer_paper_size",
    label: "Paper size",
    blurb: "Receipt width used by this branch, e.g. 80mm or 58mm.",
    kind: "text",
    category: "device",
    tier: "BRANCH",
    fallback: "80mm",
  },
  {
    key: "cash_drawer_enabled",
    label: "Cash drawer connected",
    blurb: "Kick the drawer through the printer's RJ jack after a cash sale.",
    kind: "boolean",
    category: "device",
    tier: "BRANCH",
    fallback: true,
  },
  {
    key: "terminal_id_prefix",
    label: "Terminal ID prefix",
    blurb: "Prefix stamped on terminal identifiers registered at this branch.",
    kind: "text",
    category: "device",
    tier: "BRANCH",
    fallback: "",
  },

  /* ---------- inventory & operations (cluster scope) ---------- */
  {
    key: "stock_sync_minutes",
    label: "Stock sync frequency (minutes)",
    blurb: "How often stock levels are pushed to the central server.",
    kind: "number",
    category: "inventory",
    tier: "CLUSTER",
    fallback: 15,
  },
  {
    key: "low_stock_threshold",
    label: "Low stock threshold",
    blurb: "Units left before an item is flagged for reordering.",
    kind: "number",
    category: "inventory",
    tier: "CLUSTER",
    fallback: 5,
  },
  {
    key: "require_transfer_approval",
    label: "Transfers need approval",
    blurb: "A supervisor must approve stock leaving a branch.",
    kind: "boolean",
    category: "inventory",
    tier: "CLUSTER",
    fallback: true,
  },
  {
    key: "allow_negative_stock",
    label: "Allow negative stock",
    blurb: "Let the till sell items that have run out on paper.",
    kind: "boolean",
    category: "inventory",
    tier: "CLUSTER",
    fallback: false,
  },
  {
    key: "auto_reorder_enabled",
    label: "Auto reorder suggestions",
    blurb: "Raise a draft purchase order when stock drops below the threshold.",
    kind: "boolean",
    category: "inventory",
    tier: "CLUSTER",
    fallback: false,
  },

  /* ---------- system & integrations (global scope) ---------- */
  {
    key: "currency_code",
    label: "Currency",
    blurb: "Currency code used on receipts and reports.",
    kind: "text",
    category: "system",
    tier: "GLOBAL",
    fallback: "USD",
  },
  {
    key: "tax_percentage",
    label: "Base tax rate (%)",
    blurb: "Default tax percentage before any local exemption.",
    kind: "number",
    category: "system",
    tier: "GLOBAL",
    fallback: 0,
  },
  {
    key: "base_role_permissions",
    label: "Base role for new staff",
    blurb: "Role a newly created staff account starts on.",
    kind: "text",
    category: "system",
    tier: "GLOBAL",
    fallback: "staff",
  },
  {
    key: "session_timeout_minutes",
    label: "Session timeout (minutes)",
    blurb: "Idle time before a signed-in user is locked out.",
    kind: "number",
    category: "system",
    tier: "GLOBAL",
    fallback: 30,
  },
  {
    key: "integration_api_key",
    label: "Global integration API key",
    blurb: "Shared key used by outbound integrations.",
    kind: "text",
    category: "system",
    tier: "GLOBAL",
    secret: true,
    fallback: "",
  },
];

export const SETTING_BY_KEY: Record<string, SettingDef> = Object.fromEntries(
  SETTING_DEFS.map((d) => [d.key, d]),
);

/** One resolved setting as the API hands it back. */
export type ResolvedSetting = {
  key: string;
  value: SettingValue;
  source: SettingScope | "DEFAULT";
  isOverridden: boolean;
  parentValue: SettingValue | null;
};

export const SOURCE_LABEL: Record<ResolvedSetting["source"], string> = {
  GLOBAL: "Inherited from Global",
  CLUSTER: "Inherited from Cluster",
  BRANCH: "Branch override",
  DEFAULT: "System default",
};

/** Coerce whatever the database returned into the type the field expects. */
export function coerceValue(def: SettingDef, raw: unknown): SettingValue {
  if (raw === null || raw === undefined) return def.fallback;
  if (def.kind === "boolean") return raw === true || raw === "true";
  if (def.kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : (def.fallback as number);
  }
  return typeof raw === "string" ? raw : String(raw);
}

/** Human label for a scope selection. */
export function scopeLabel(scope: SettingScope, name?: string): string {
  if (scope === "GLOBAL") return "Global";
  if (scope === "CLUSTER") return `Cluster: ${name || "—"}`;
  return `Branch: ${name || "—"}`;
}

/** The tier a scope inherits from, for badge wording. */
export function parentScope(scope: SettingScope): SettingScope | null {
  if (scope === "BRANCH") return "CLUSTER";
  if (scope === "CLUSTER") return "GLOBAL";
  return null;
}