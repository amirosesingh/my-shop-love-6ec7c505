import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const callerInput = z.object({
  accessToken: z.string().min(10).optional(),
  terminalToken: z.string().min(10).optional(),
  storeId: z.string().max(64).optional(),
});

const ruleValue = z.union([z.boolean(), z.number()]);

const saveInput = z.object({
  accessToken: z.string().min(10),
  storeId: z.string().max(64).optional(),
  patch: z.record(z.string(), ruleValue),
});

const pinInput = z.object({
  accessToken: z.string().min(10).optional(),
  terminalToken: z.string().min(10).optional(),
  managerId: z.string().min(1).max(64),
  pin: z.string().regex(/^\d{4,6}$/),
  action: z.string().min(1).max(64),
  ruleKey: z.string().max(64).optional(),
  requestedBy: z.string().max(120).optional(),
  storeId: z.string().max(64).optional(),
  terminalId: z.string().max(64).optional(),
  detail: z.string().max(400).optional(),
});

const closeInput = z.object({
  accessToken: z.string().min(10).optional(),
  terminalToken: z.string().min(10).optional(),
  storeId: z.string().max(64).optional(),
  countedCash: z.number().nullable().optional(),
  grantToken: z.string().optional(),
});

const bypassInput = z.object({
  accessToken: z.string().min(10),
  action: z.string().min(1).max(64),
  ruleKey: z.string().max(64).optional(),
  storeId: z.string().max(64).optional(),
  terminalId: z.string().max(64).optional(),
  detail: z.string().max(400).optional(),
});

/** Any signed-in till user: a Supabase staff account or a cashier session. */
async function assertCaller(data: { accessToken?: string; terminalToken?: string }) {
  if (data.accessToken) {
    const { verifyPosStaff } = await import("./secure-settings.server");
    const caller = await verifyPosStaff(data.accessToken);
    return { id: caller.userId, role: caller.role, isSupervisor: caller.isAdmin };
  }
  if (data.terminalToken) {
    const { verifyCashierSession } = await import("./pos-session.server");
    const session = verifyCashierSession(data.terminalToken);
    if (session) return { id: session.id, role: "cashier", isSupervisor: false };
  }
  throw new Error("Not signed in");
}

/** Effective, database-backed rule set for the caller's branch. */
export const getPosRules = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => callerInput.parse(data))
  .handler(async ({ data }) => {
    const { loadRules } = await import("./pos-rules.server");
    // Reading rules must never fail before sign-in: an unauthenticated caller
    // gets the global defaults chain (global row, then built-in defaults).
    if (!data.accessToken && !data.terminalToken) {
      return { ok: true as const, anonymous: true as const, rules: await loadRules("") };
    }
    try {
      await assertCaller(data);
      return {
        ok: true as const,
        anonymous: false as const,
        rules: await loadRules(data.storeId ?? ""),
      };
    } catch (e) {
      // A partially initialised session falls back to the branch/global chain
      // instead of raising into the UI.
      return {
        ok: false as const,
        anonymous: true as const,
        error: (e as Error).message,
        rules: await loadRules(""),
      };
    }
  });

/** Supervisor-only write; the database re-checks the role as well. */
export const savePosRules = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }) => {
    const { saveRules } = await import("./pos-rules.server");
    try {
      const caller = await assertCaller(data);
      if (!caller.isSupervisor) return { ok: false as const, error: "Supervisors only" };
      const rules = await saveRules(
        data.storeId ?? "",
        data.patch as never,
        data.accessToken,
      );
      return { ok: true as const, rules };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/**
 * Manager PIN check. The PIN is compared inside the database — never in the
 * browser — and a short-lived signed grant is returned for the action.
 */
export const verifyManagerPin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pinInput.parse(data))
  .handler(async ({ data }) => {
    const { verifyManagerPinInDb, signOverrideGrant } = await import(
      "./pos-rules.server"
    );
    try {
      // The audit entry is written by the database inside the same routine that
      // checks the PIN, so an override record can never be forged separately.
      const manager = await verifyManagerPinInDb(data.managerId, data.pin, {
        action: data.action,
        ruleKey: data.ruleKey ?? null,
        requestedBy: data.requestedBy ?? null,
        storeId: data.storeId ?? null,
        terminalId: data.terminalId ?? null,
        detail: data.detail ?? null,
      });
      if (!manager) return { ok: false as const, error: "Invalid manager ID or PIN" };
      return {
        ok: true as const,
        manager: { id: manager.userId, name: manager.name, role: manager.role },
        grantToken: signOverrideGrant({
          action: data.action,
          approvedBy: manager.userId,
          role: manager.role,
        }),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/**
 * Server-side gate for closing a shift: held tickets and the closing count
 * are checked against the database rules, not the browser's copy.
 */

/**
 * Admin bypass. An administrator never types a PIN, but the approval is still
 * proved on the server (their own session) and written to the override log, so
 * the audit trail is identical to a PIN-approved action.
 */
export const authorizeAsAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => bypassInput.parse(data))
  .handler(async ({ data }) => {
    const { signOverrideGrant, logOverride } = await import("./pos-rules.server");
    try {
      const { verifyPosStaff } = await import("./secure-settings.server");
      const caller = await verifyPosStaff(data.accessToken);
      if (caller.role !== "admin") {
        return { ok: false as const, error: "Administrators only" };
      }
      await logOverride({
        action: data.action,
        ruleKey: data.ruleKey ?? null,
        requestedBy: caller.userId,
        approvedBy: caller.userId,
        approvedRole: "admin",
        storeId: data.storeId ?? null,
        terminalId: data.terminalId ?? null,
        detail: `${data.detail ?? ""} (auto-approved: administrator)`.trim(),
      });
      return {
        ok: true as const,
        manager: { id: caller.userId, name: caller.userId, role: "admin" },
        grantToken: signOverrideGrant({
          action: data.action,
          approvedBy: caller.userId,
          role: "admin",
        }),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const assertShiftClosable = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => closeInput.parse(data))
  .handler(async ({ data }) => {
    const { loadRules, heldOrderCount, verifyOverrideGrant } = await import("./pos-rules.server");
    try {
      await assertCaller(data);
      const rules = await loadRules(data.storeId ?? "");
      const override = verifyOverrideGrant(data.grantToken, "shift_close");
      if (rules.block_shift_close_on_hold && !override) {
        const held = await heldOrderCount(data.storeId ?? "");
        if (held > 0) {
          return {
            ok: false as const,
            code: "HELD_BILLS" as const,
            held,
            error: `Shift cannot be closed. You have ${held} held bill(s) pending. Please settle or cancel them first.`,
          };
        }
      }
      if (
        (rules.require_daily_sales_for_shift_close || rules.require_counted_cash_on_close) &&
        (data.countedCash === null ||
          data.countedCash === undefined ||
          !Number.isFinite(data.countedCash) ||
          data.countedCash < 0)
      ) {
        return {
          ok: false as const,
          code: "NO_COUNT" as const,
          held: 0,
          error: "Enter the counted cash in the drawer before closing the shift.",
        };
      }
      return { ok: true as const, code: "OK" as const, held: 0, error: "" };
    } catch (e) {
      return { ok: false as const, code: "ERROR" as const, held: 0, error: (e as Error).message };
    }
  });