// ============================================================================
// Granular feature permissions. Stored as a JSONB object on public.app_users.
// ============================================================================

export const PERMISSION_GROUPS = [
  {
    id: "drawer",
    label: "Cash Drawer",
    keys: [
      "can_open_drawer",
      "can_close_drawer",
      "can_view_drawer_balance",
      "can_open_shift",
      "can_close_shift",
      "can_bypass_shift_lock",
    ],
  },
  {
    id: "approvals",
    label: "Sales Approvals (off = manager PIN required)",
    keys: [
      "can_delete_line",
      "can_reduce_qty",
      "can_discount_bill",
      "can_override_price",
      "can_void_cart",
      "can_no_sale_open",
      "can_edit_tenders",
    ],
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
      "can_reprint_bill",
      "can_send_whatsapp_bill",
      "can_manage_bookings",
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
      "can_adjust_stock",
      "can_create_transfer",
      "can_receive_transfer",
      "can_approve_transfer",
      "can_manage_locations",
    ],
  },
  {
    id: "members",
    label: "Members & Loyalty",
    keys: [
      "can_add_member",
      "can_edit_member_points",
      "can_apply_member_discount",
      "can_redeem_points",
      "can_view_member_history",
    ],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    keys: [
      "can_view_sales_reports",
      "can_view_dashboard",
      "can_view_audit_trail",
      "can_export_reports",
    ],
  },
  {
    id: "system",
    label: "System & Administration",
    keys: [
      "can_access_pos_settings",
      "can_manage_staff",
      "can_manage_promotions",
      "can_manage_terminals",
      "can_manage_sync_backup",
    ],
  },
] as const;

export type PermissionKey =
  | "can_open_drawer"
  | "can_close_drawer"
  | "can_view_drawer_balance"
  | "can_open_shift"
  | "can_close_shift"
  | "can_bypass_shift_lock"
  | "can_delete_line"
  | "can_reduce_qty"
  | "can_discount_bill"
  | "can_override_price"
  | "can_void_cart"
  | "can_no_sale_open"
  | "can_edit_tenders"
  | "can_process_sale"
  | "can_give_discount"
  | "can_void_item"
  | "can_hold_cart"
  | "can_process_refund"
  | "can_process_exchange"
  | "can_reprint_bill"
  | "can_send_whatsapp_bill"
  | "can_manage_bookings"
  | "can_view_inventory"
  | "can_edit_product_price"
  | "can_add_new_product"
  | "can_receive_purchase_order"
  | "can_adjust_stock"
  | "can_create_transfer"
  | "can_receive_transfer"
  | "can_approve_transfer"
  | "can_manage_locations"
  | "can_add_member"
  | "can_edit_member_points"
  | "can_apply_member_discount"
  | "can_redeem_points"
  | "can_view_member_history"
  | "can_view_sales_reports"
  | "can_view_dashboard"
  | "can_view_audit_trail"
  | "can_export_reports"
  | "can_access_pos_settings"
  | "can_manage_staff"
  | "can_manage_promotions"
  | "can_manage_terminals"
  | "can_manage_sync_backup";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_open_drawer: "Open cash drawer",
  can_close_drawer: "Close / count drawer",
  can_view_drawer_balance: "View drawer balance",
  can_open_shift: "Open a shift",
  can_close_shift: "Close a shift / run Z-report",
  can_bypass_shift_lock: "Use the terminal without an open shift",
  can_delete_line: "Delete a line from the cart",
  can_reduce_qty: "Reduce an item quantity",
  can_discount_bill: "Apply a bill-level discount",
  can_override_price: "Override a price at the till",
  can_void_cart: "Void the whole cart",
  can_no_sale_open: "Open the drawer without a sale",
  can_edit_tenders: "Edit split-payment tenders",
  can_process_sale: "Process a sale",
  can_give_discount: "Give discounts",
  can_void_item: "Void a line item",
  can_hold_cart: "Hold / park a cart",
  can_process_refund: "Process refunds",
  can_process_exchange: "Process exchanges",
  can_reprint_bill: "Reprint / re-issue a bill",
  can_send_whatsapp_bill: "Send a bill by WhatsApp",
  can_manage_bookings: "Take and collect bookings (pay later)",
  can_view_inventory: "View inventory",
  can_edit_product_price: "Edit product pricing",
  can_add_new_product: "Add new products",
  can_receive_purchase_order: "Receive purchase orders",
  can_adjust_stock: "Adjust / recount stock",
  can_create_transfer: "Create stock transfer requests",
  can_receive_transfer: "Approve / receive transfers",
  can_approve_transfer: "Authorise transfers before stock moves",
  can_manage_locations: "Manage locations & warehouses",
  can_add_member: "Add members",
  can_edit_member_points: "Edit member points",
  can_apply_member_discount: "Apply member discount",
  can_redeem_points: "Redeem loyalty points at the till",
  can_view_member_history: "View member purchase history",
  can_view_sales_reports: "View sales reports",
  can_view_dashboard: "View the live dashboard",
  can_view_audit_trail: "View register activity / audit trail",
  can_export_reports: "Export or download report data",
  can_access_pos_settings: "Access POS settings",
  can_manage_staff: "Manage staff & permissions",
  can_manage_promotions: "Edit promotions & coupon rules",
  can_manage_terminals: "Manage terminal activation tokens",
  can_manage_sync_backup: "Run sync, backup & restore",
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
  "can_open_shift",
  "can_close_shift",
  "can_process_sale",
  "can_hold_cart",
  "can_reprint_bill",
  "can_manage_bookings",
  "can_view_inventory",
  "can_add_member",
  "can_apply_member_discount",
  "can_view_member_history",
]);

/** Kept for existing screens that still ask for the older coarse flags. */
export const DEFAULT_PERMISSIONS = CASHIER_PERMISSIONS;

/** Baseline a brand-new warehouse user starts with. Every key stays editable
 *  from the Staff Management permission matrix — nothing is hard-locked. */
export const WAREHOUSE_PERMISSIONS: StaffPermissions = build([
  "can_view_inventory",
  "can_add_new_product",
  "can_receive_purchase_order",
  "can_adjust_stock",
  "can_create_transfer",
  "can_receive_transfer",
  "can_approve_transfer",
  "can_manage_locations",
]);

// --------------------------------------------------------------------------
// Simplified roles. The database enum is app_role (admin | manager | staff).
// Cashiers live in public.cashiers, so an app_users row with role `staff`
// is a warehouse account.
// --------------------------------------------------------------------------
export type StaffRole = "cashier" | "warehouse" | "supervisor" | "admin";
export const STAFF_ROLES: StaffRole[] = ["cashier", "warehouse", "supervisor", "admin"];

export type DbRole = "admin" | "manager" | "staff";

export const toDbRole = (role: StaffRole): DbRole =>
  role === "admin" ? "admin" : role === "supervisor" ? "manager" : "staff";

export const fromDbRole = (role: string | null | undefined): StaffRole =>
  role === "admin" ? "admin" : role === "manager" ? "supervisor" : "warehouse";

export const rolePermissions = (role: StaffRole): StaffPermissions =>
  role === "cashier"
    ? { ...CASHIER_PERMISSIONS }
    : role === "warehouse"
      ? { ...WAREHOUSE_PERMISSIONS }
      : { ...FULL_PERMISSIONS };

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
  const limited = role === "cashier" || role === "warehouse";
  const base = limited ? { ...NO_PERMISSIONS } : { ...FULL_PERMISSIONS };
  // No stored matrix yet → fall back to the role's default preset.
  if (!raw) return rolePermissions(role);
  for (const [key, value] of Object.entries(raw)) {
    const resolved = resolvePermission(key as PermissionFlag);
    if (resolved in base) base[resolved] = !!value;
  }
  return base;
}
