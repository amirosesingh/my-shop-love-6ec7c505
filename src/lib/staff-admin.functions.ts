import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Records a supervisor action in the permanent edit history. Written with the
 * internal service key so the entry cannot be altered or skipped by a till.
 */
async function audit(entry: {
  accessToken: string;
  actionType: string;
  entityAffected: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  const { describeAccessToken } = await import("./system-audit-access.server");
  const { writeSystemAudit } = await import("./system-audit.server");
  const actor = await describeAccessToken(entry.accessToken);
  await writeSystemAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actionType: entry.actionType,
    entityAffected: entry.entityAffected,
    entityId: entry.entityId,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
  });
}

/** Create or update a staff member and the account behind them. */
export const saveStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      accessToken: z.string().min(10).max(4000),
      displayName: z.string().trim().min(1).max(120),
      username: z.string().min(2).max(160),
      pin: z.string().min(4).max(32).optional(),
      password: z.string().min(8).max(200).optional(),
      branchId: z.string().max(60).nullable().optional(),
      roleSlug: z.string().min(2).max(60),
      baseRole: z.enum(["admin", "manager", "staff"]),
      active: z.boolean(),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      await mod.provisionStaffAccount({
        displayName: data.displayName,
        username: data.username,
        pin: data.pin ?? "",
        password: data.password ?? "",
        branchId: data.branchId ?? null,
        roleSlug: data.roleSlug,
        baseRole: data.baseRole,
        active: data.active,
      });
      await audit({
        accessToken: data.accessToken,
        actionType: "staff.account_created",
        entityAffected: "app_users",
        entityId: data.username,
        newValue: {
          displayName: data.displayName,
          roleSlug: data.roleSlug,
          baseRole: data.baseRole,
          branchId: data.branchId ?? null,
          active: data.active,
        },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/** Switch a staff account on or off. */
export const setStaffAccountActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    accessToken: z.string().min(10).max(4000),
    username: z.string().min(2).max(160),
    active: z.boolean(),
  }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      await mod.setStaffActive(data.username, data.active);
      await audit({
        accessToken: data.accessToken,
        actionType: data.active ? "staff.account_enabled" : "staff.account_disabled",
        entityAffected: "app_users",
        entityId: data.username,
        newValue: { active: data.active },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/**
 * Public by necessity: a till has no session yet when someone taps their PIN.
 * The PIN itself is the credential and is checked against the stored hash
 * before anything is created or changed.
 */
export const preparePinSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    username: z.string().min(2).max(40),
    pin: z.string().min(4).max(32),
  }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true; email: string } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      return await mod.ensurePinAccount(data.username, data.pin);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/** The sign-in grid for a till: active staff who hold a PIN. */
export const listTerminalStaffAccounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ storeId: z.string().max(60).nullable().optional() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const mod = await import("./staff-admin.server");
      const staff = await mod.listTerminalStaff(data.storeId ?? null);
      return { ok: true as const, staff };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, staff: [] };
    }
  });

/** One-off catch-up for tills that still have old cashier-only records. */
export const migrateCashiersToAccounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ accessToken: z.string().min(10).max(4000) }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true; migrated: number } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      const res = await mod.migrateLegacyCashiers();
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/** Update profile fields and optionally replace the credential. */
export const updateStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    accessToken: z.string().min(10).max(4000),
    username: z.string().min(2).max(160),
    displayName: z.string().trim().min(1).max(120),
    branchId: z.string().max(60).nullable(),
    roleSlug: z.string().min(2).max(60),
    baseRole: z.enum(["admin", "manager", "staff"]),
    active: z.boolean(),
    credential: z.string().max(200).optional(),
  }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      const before = await mod.readStaffSnapshot(data.username);
      await mod.updateStaffProfile(data);
      await audit({
        accessToken: data.accessToken,
        actionType: "staff.account_updated",
        entityAffected: "app_users",
        entityId: data.username,
        oldValue: before,
        newValue: {
          displayName: data.displayName,
          roleSlug: data.roleSlug,
          baseRole: data.baseRole,
          branchId: data.branchId,
          active: data.active,
          credentialChanged: Boolean(data.credential),
        },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/** Permanently remove an inactive account after server-side safety checks. */
export const deleteStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    accessToken: z.string().min(10).max(4000),
    username: z.string().min(2).max(160),
  }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      const removed = await mod.readStaffSnapshot(data.username);
      await mod.permanentlyDeleteStaff(data.username, data.accessToken);
      await audit({
        accessToken: data.accessToken,
        actionType: "staff.account_deleted",
        entityAffected: "app_users",
        entityId: data.username,
        oldValue: removed,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
