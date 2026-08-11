/**
 * Roles staff can be assigned to.
 *
 * Four roles are built in and can never be removed; an administrator can add
 * as many custom roles as they like. Every role is only a starting point: the
 * permission checklist on a person's record can always be tuned afterwards,
 * and doing so marks that person as holding "Custom permissions".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseExternal } from "@/integrations/supabase/external-client";
import {
  PERMISSION_KEYS,
  cacheRoleDefinitions,
  normalizePermissions,
  rolePermissions,
  type StaffPermissions,
  type StaffRole,
} from "@/lib/permissions";

const sb = supabaseExternal as unknown as SupabaseClient;

export type RoleDef = {
  slug: string;
  name: string;
  /** Which built-in preset this role starts from. */
  baseLevel: StaffRole;
  permissions: StaffPermissions;
  isCore: boolean;
};

export const CORE_ROLE_NAMES: Record<StaffRole, string> = {
  cashier: "Cashier",
  warehouse: "Warehouse Supervisor",
  supervisor: "Supervisor",
  admin: "Admin",
};

const coreRole = (base: StaffRole): RoleDef => ({
  slug: base,
  name: CORE_ROLE_NAMES[base],
  baseLevel: base,
  permissions: rolePermissions(base),
  isCore: true,
});

/** Used before the roles table answers, and on older databases. */
export const CORE_ROLES: RoleDef[] = (
  ["cashier", "warehouse", "supervisor", "admin"] as StaffRole[]
).map(coreRole);

const isStaffRole = (v: unknown): v is StaffRole =>
  v === "cashier" || v === "warehouse" || v === "supervisor" || v === "admin";

function mapRow(r: Record<string, unknown>): RoleDef {
  const base = isStaffRole(r["base_level"]) ? r["base_level"] : "cashier";
  const stored = (r["permissions"] ?? {}) as Record<string, unknown>;
  const isCore = r["is_core"] === true;
  return {
    slug: String(r["slug"] ?? ""),
    name: String(r["name"] ?? r["slug"] ?? ""),
    baseLevel: base,
    // A built-in role with no stored preset falls back to the shipped preset.
    permissions:
      isCore && Object.keys(stored).length === 0
        ? rolePermissions(base)
        : normalizePermissions(stored, base),
    isCore,
  };
}

export async function listStaffRoles(): Promise<RoleDef[]> {
  const { data, error } = await sb.from("staff_roles").select("*").order("name");
  // Older databases have no roles table yet — the built-ins still work.
  if (error) return CORE_ROLES;
  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  const roles = rows.length ? rows : CORE_ROLES;
  // Keep the resolver working with no connection.
  cacheRoleDefinitions(roles);
  return roles;
}

export async function saveStaffRole(role: {
  slug: string;
  name: string;
  baseLevel: StaffRole;
  permissions: StaffPermissions;
}) {
  const { error } = await sb.rpc("staff_role_save", {
    _slug: role.slug,
    _name: role.name,
    _base_level: role.baseLevel,
    _permissions: role.permissions,
  });
  if (error) throw error;
}

export async function deleteStaffRole(slug: string) {
  const { error } = await sb.rpc("staff_role_delete", { _slug: slug });
  if (error) throw error;
}

/** Turn a display name into a stable slug. */
export const roleSlug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "role";

/** True when the two permission sets differ on any single toggle. */
export const permissionsDiffer = (a: StaffPermissions, b: StaffPermissions): boolean =>
  PERMISSION_KEYS.some((k) => !!a[k] !== !!b[k]);

/**
 * What to show next to a person's role: the role name, or "Custom
 * permissions" as soon as a single toggle no longer matches the preset.
 */
export function describeAssignment(
  role: RoleDef | undefined,
  permissions: StaffPermissions,
): { label: string; custom: boolean } {
  if (!role) return { label: "Custom permissions", custom: true };
  const custom = permissionsDiffer(role.permissions, permissions);
  return { label: custom ? `${role.name} · Custom permissions` : role.name, custom };
}