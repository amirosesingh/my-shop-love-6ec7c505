import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const token = z.string().min(10).max(4000);

const staffInput = z.object({
  accessToken: token,
  displayName: z.string().min(1).max(120),
  username: z.string().min(2).max(160),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  password: z.string().min(8).max(200).optional(),
  branchId: z.string().max(60).nullable().optional(),
  roleSlug: z.string().min(2).max(60),
  baseRole: z.enum(["admin", "manager", "staff"]),
  active: z.boolean(),
});

/** Create or update a staff member and the account behind them. */
export const saveStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => staffInput.parse(data))
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
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

const activeInput = z.object({
  accessToken: token,
  username: z.string().min(2).max(40),
  active: z.boolean(),
});

/** Switch a staff account on or off. */
export const setStaffAccountActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => activeInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      await mod.requireSupervisor(data.accessToken);
      await mod.setStaffActive(data.username, data.active);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

const pinInput = z.object({
  username: z.string().min(2).max(40),
  pin: z.string().regex(/^\d{4,6}$/),
});

/**
 * Public by necessity: a till has no session yet when someone taps their PIN.
 * The PIN itself is the credential and is checked against the stored hash
 * before anything is created or changed.
 */
export const preparePinSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pinInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; email: string } | { ok: false; error: string }> => {
    try {
      const mod = await import("./staff-admin.server");
      return await mod.ensurePinAccount(data.username, data.pin);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

const listInput = z.object({ storeId: z.string().max(60).nullable().optional() });

/** The sign-in grid for a till: active staff who hold a PIN. */
export const listTerminalStaffAccounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const mod = await import("./staff-admin.server");
      const staff = await mod.listTerminalStaff(data.storeId ?? null);
      return { ok: true as const, staff };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, staff: [] };
    }
  });

const bulkInput = z.object({ accessToken: token });

/** One-off catch-up for tills that still have old cashier-only records. */
export const migrateCashiersToAccounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => bulkInput.parse(data))
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
