import { describe, expect, it } from "vitest";
import {
  CASHIER_PERMISSIONS,
  FULL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  WAREHOUSE_PERMISSIONS,
  normalizePermissions,
  rolePermissions,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * Snapshot of the least-privilege presets. If a preset is widened, this test
 * fails and the change must be made deliberately — that is the point: it
 * catches accidental privilege escalation before a release.
 */
const CASHIER_ALLOWED: PermissionKey[] = [
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
];

const WAREHOUSE_ALLOWED: PermissionKey[] = [
  "can_view_inventory",
  "can_add_new_product",
  "can_receive_purchase_order",
  "can_adjust_stock",
  "can_create_transfer",
  "can_receive_transfer",
  "can_manage_locations",
];

const granted = (matrix: Record<string, boolean>) =>
  Object.entries(matrix)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();

describe("permission presets", () => {
  it("cashiers keep exactly the till-floor permissions", () => {
    expect(granted(CASHIER_PERMISSIONS)).toEqual([...CASHIER_ALLOWED].sort());
  });

  it("warehouse users keep exactly the stock permissions", () => {
    expect(granted(WAREHOUSE_PERMISSIONS)).toEqual([...WAREHOUSE_ALLOWED].sort());
  });

  it("never grants cashiers money, settings or staff control", () => {
    for (const key of [
      "can_view_sales_reports",
      "can_access_pos_settings",
      "can_manage_staff",
      "can_edit_product_price",
      "can_process_refund",
      "can_adjust_stock",
      "can_view_dashboard",
      "can_export_reports",
      "can_view_audit_trail",
      "can_manage_terminals",
      "can_manage_sync_backup",
      "can_manage_promotions",
    ] as PermissionKey[]) {
      expect(CASHIER_PERMISSIONS[key], key).toBe(false);
    }
  });

  it("limited roles cannot bypass the shift lock", () => {
    expect(CASHIER_PERMISSIONS["can_bypass_shift_lock"]).toBe(false);
    expect(WAREHOUSE_PERMISSIONS["can_bypass_shift_lock"]).toBe(false);
    expect(FULL_PERMISSIONS["can_bypass_shift_lock"]).toBe(true);
  });

  it("never grants warehouse users money or staff control", () => {
    for (const key of [
      "can_view_sales_reports",
      "can_access_pos_settings",
      "can_manage_staff",
      "can_process_sale",
      "can_process_refund",
      "can_view_dashboard",
      "can_export_reports",
      "can_manage_terminals",
      "can_manage_sync_backup",
    ] as PermissionKey[]) {
      expect(WAREHOUSE_PERMISSIONS[key], key).toBe(false);
    }
  });

  it("only admins and supervisors get the full matrix", () => {
    expect(rolePermissions("admin")).toEqual(FULL_PERMISSIONS);
    expect(rolePermissions("supervisor")).toEqual(FULL_PERMISSIONS);
    expect(rolePermissions("cashier")).not.toEqual(FULL_PERMISSIONS);
    expect(rolePermissions("warehouse")).not.toEqual(FULL_PERMISSIONS);
  });
});

describe("permission matrix integrity", () => {
  it("every key is reachable from the Staff Management UI groups", () => {
    const inGroups = PERMISSION_GROUPS.flatMap((g) => [...g.keys]);
    expect([...inGroups].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("unknown stored keys can never grant a permission", () => {
    const matrix = normalizePermissions(
      { can_manage_staff: true, totally_made_up: true } as Record<string, unknown>,
      "cashier",
    );
    expect(Object.keys(matrix).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect((matrix as Record<string, boolean>).totally_made_up).toBeUndefined();
  });

  it("a missing stored matrix falls back to the role preset, not full access", () => {
    expect(normalizePermissions(null, "cashier")).toEqual(CASHIER_PERMISSIONS);
    expect(normalizePermissions(undefined, "warehouse")).toEqual(WAREHOUSE_PERMISSIONS);
  });

  it("an empty stored matrix denies everything for limited roles", () => {
    const matrix = normalizePermissions({}, "cashier");
    expect(granted(matrix)).toEqual([]);
  });
});