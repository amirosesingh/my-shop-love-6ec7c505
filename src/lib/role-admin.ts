/**
 * Managing roles from the admin screens.
 *
 * Built-in roles are protected: they cannot be renamed away or removed. Custom
 * roles can be created freely and are only removable while nobody holds them.
 */
import {
  CORE_ROLES,
  deleteStaffRole,
  listStaffRoles,
  roleSlug,
  saveStaffRole,
  type RoleDef,
} from "@/lib/staff-roles";
import { normalizePermissions, rolePermissions, type StaffPermissions, type StaffRole } from "@/lib/permissions";

export type { RoleDef };

/** Every role with its permission checklist resolved. */
export async function getRolesWithPermissions(): Promise<RoleDef[]> {
  return listStaffRoles();
}

/** Add a role. Its slug is derived from the name and must be free. */
export async function createCustomRole(
  name: string,
  permissions: Partial<StaffPermissions>,
  baseLevel: StaffRole = "cashier",
): Promise<RoleDef> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Give the role a name");
  const slug = roleSlug(trimmed);
  const existing = await listStaffRoles();
  if (existing.some((r) => r.slug === slug)) {
    throw new Error("A role with a very similar name already exists");
  }
  const resolved = normalizePermissions(permissions, baseLevel);
  await saveStaffRole({ slug, name: trimmed, baseLevel, permissions: resolved });
  return { slug, name: trimmed, baseLevel, permissions: resolved, isCore: false };
}

/** Change what a role is allowed to do. */
export async function updateRolePermissions(
  role: RoleDef,
  permissions: Partial<StaffPermissions>,
): Promise<void> {
  await saveStaffRole({
    slug: role.slug,
    name: role.name,
    baseLevel: role.baseLevel,
    permissions: normalizePermissions(permissions, role.baseLevel),
  });
}

/** Remove a custom role. Refused for built-ins and for roles still in use. */
export async function deleteCustomRole(role: RoleDef): Promise<void> {
  if (role.isCore) throw new Error("Built-in roles cannot be removed");
  try {
    await deleteStaffRole(role.slug);
  } catch (e) {
    const message = (e as { message?: string }).message ?? "";
    if (message.includes("ROLE_IN_USE")) {
      throw new Error("Someone is still assigned this role — move them first");
    }
    throw e;
  }
}

/** The permission preset a built-in level starts from. */
export const presetFor = (base: StaffRole): StaffPermissions => rolePermissions(base);

export { CORE_ROLES };
