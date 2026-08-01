// ============================================================================
// Granular feature permissions. Stored as a JSONB object on public.app_users.
// ============================================================================

export const PERMISSION_GROUPS = [
  {
    id: "drawer",
    label: "Cash Drawer",
    keys: ["can_open_drawer", "can_close_drawer", "can_view_drawer_balance"],
  },
  {
    id: "sales",
    label: "Sales & Checkout",
    keys: [
      "can_process_sale",
      "can_give_discount",
      "can_void_item",
      "can_hold_cart",
      "can_process_refund",
      "can_process_exchange",
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Pricing",
    keys: [
      "can_view_inventory",
      "can_edit_product_price",
      "can_add_new_product",
      "can_receive_purchase_order",
    ],
  },
  {
    id: "members",
    label: "Members & Loyalty",
    keys: ["can_add_member", "can_edit_member_points", "can_apply_member_discount"],
  },
  {
    id: "reports",
    label: "Reports & Settings",
    keys: ["can_view_sales_reports", "can_access_pos_settings", "can_manage_staff"],
  },
] as const;

export type PermissionKey =
  | "can_open_drawer"
  | "can_close_drawer"
  | "can_view_drawer_balance"
  | "can_process_sale"
  | "can_give_discount"
  | "can_void_item"
  | "can_hold_cart"
  | "can_process_refund"
  | "can_process_exchange"
  | "can_view_inventory"
  | "can_edit_product_price"
  | "can_add_new_product"
  | "can_receive_purchase_order"
  | "can_add_member"
  | "can_edit_member_points"
  | "can_apply_member_discount"
  | "can_view_sales_reports"
  | "can_access_pos_settings"
  | "can_manage_staff";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_open_drawer: "Open cash drawer",
  can_close_drawer: "Close / count drawer",
  can_view_drawer_balance: "View drawer balance",
  can_process_sale: "Process a sale",
  can_give_discount: "Give discounts",
  can_void_item: "Void a line item",
  can_hold_cart: "Hold / park a cart",
  can_process_refund: "Process refunds",
  can_process_exchange: "Process exchanges",
  can_view_inventory: "View inventory",
  can_edit_product_price: "Edit product pricing",
  can_add_new_product: "Add new products",
  can_receive_purchase_order: "Receive purchase orders",
  can_add_member: "Add members",
  can_edit_member_points: "Edit member points",
  can_apply_member_discount: "Apply member discount",
  can_view_sales_reports: "View sales reports",
  can_access_pos_settings: "Access POS settings",
  can_manage_staff: "Manage staff & permissions",
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

export type StaffPermissions = Record<PermissionKey, boolean>;

const build = (on: PermissionKey[]): StaffPermissions =>
  PERMISSION_KEYS.reduce((acc, k) => {
    acc[k] = on.includes(k);
    return acc;
  }, {} as StaffPermissions);

export const FULL_PERMISSIONS: StaffPermissions = build(PERMISSION_KEYS);
export const NO_PERMISSIONS: StaffPermissions = build([]);

/** Baseline a brand-new cashier starts with. */
export const CASHIER_PERMISSIONS: StaffPermissions = build([
  "can_open_drawer",
  "can_close_drawer",
  "can_process_sale",
  "can_hold_cart",
  "can_view_inventory",
  "can_add_member",
  "can_apply_member_discount",
]);

/** Kept for existing screens that still ask for the older coarse flags. */
export const DEFAULT_PERMISSIONS = CASHIER_PERMISSIONS;

// --------------------------------------------------------------------------
// Simplified roles. The database enum is app_role (admin | manager | staff).
// --------------------------------------------------------------------------
export type StaffRole = "cashier" | "supervisor" | "admin";
export const STAFF_ROLES: StaffRole[] = ["cashier", "supervisor", "admin"];

export type DbRole = "admin" | "manager" | "staff";

export const toDbRole = (role: StaffRole): DbRole =>
  role === "admin" ? "admin" : role === "supervisor" ? "manager" : "staff";

export const fromDbRole = (role: string | null | undefined): StaffRole =>
  role === "admin" ? "admin" : role === "manager" ? "supervisor" : "cashier";

export const rolePermissions = (role: StaffRole): StaffPermissions =>
  role === "cashier" ? { ...CASHIER_PERMISSIONS } : { ...FULL_PERMISSIONS };

// --------------------------------------------------------------------------
// Legacy flag aliases used by older screens / nav config.
// --------------------------------------------------------------------------
export type LegacyFlag =
  | "financials"
  | "products"
  | "ecommerce"
  | "can_refund"
  | "can_open_drawer_manual";

const LEGACY_MAP: Record<LegacyFlag, PermissionKey> = {
  financials: "can_view_sales_reports",
  products: "can_add_new_product",
  ecommerce: "can_edit_product_price",
  can_refund: "can_process_refund",
  can_open_drawer_manual: "can_open_drawer",
};

export type PermissionFlag = PermissionKey | LegacyFlag;

export const resolvePermission = (flag: PermissionFlag): PermissionKey =>
  (LEGACY_MAP as Record<string, PermissionKey>)[flag] ?? (flag as PermissionKey);

/** Normalise any stored JSONB blob (old or new shape) into a full matrix. */
export function normalizePermissions(
  raw: Record<string, unknown> | null | undefined,
  role: StaffRole = "cashier",
): StaffPermissions {
  const base = role === "cashier" ? { ...NO_PERMISSIONS } : { ...FULL_PERMISSIONS };
  if (!raw) return role === "cashier" ? { ...CASHIER_PERMISSIONS } : base;
  for (const [key, value] of Object.entries(raw)) {
    const resolved = resolvePermission(key as PermissionFlag);
    if (resolved in base) base[resolved] = !!value;
  }
  return base;
}
