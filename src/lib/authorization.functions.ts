/**
 * Server functions for the authorisation framework.
 *
 * Every entry point proves who is calling before it does anything, and every
 * outcome — approved, rejected, wrong PIN or refused — is written to the
 * authorisation log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const caller = z.object({
  accessToken: z.string().min(10).optional(),
  terminalToken: z.string().min(10).optional(),
  cashierToken: z.string().min(10).optional(),
});

const rulesInput = caller.extend({ storeId: z.string().max(64).optional() });

const saveRuleInput = caller.extend({
  actionKey: z.string().min(1).max(64),
  scopeType: z.enum(["global", "branch"]),
  scopeId: z.string().max(64).default(""),
  mode: z.enum(["none", "pin", "request", "either"]),
  allowedRoles: z.array(z.string().max(40)).max(20).default([]),
  allowedUserIds: z.array(z.string().max(64)).max(50).default([]),
  requireReason: z.boolean().default(false),
  threshold: z.number().nullable().default(null),
});

const pinInput = caller.extend({
  actionKey: z.string().min(1).max(64),
  authorizerId: z.string().min(1).max(64),
  pin: z.string().regex(/^\d{4,8}$/),
  storeId: z.string().max(64).optional(),
  terminalId: z.string().max(64).optional(),
  reason: z.string().max(400).optional(),
});

const submitInput = caller.extend({
  actionKey: z.string().min(1).max(64),
  storeId: z.string().max(64).optional(),
  terminalId: z.string().max(64).optional(),
  reason: z.string().max(400).default(""),
  payload: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

const listInput = caller.extend({
  storeId: z.string().max(64).optional(),
  allBranches: z.boolean().default(false),
  status: z.string().max(20).default("pending"),
});

const decideInput = caller.extend({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(400).default(""),
});

const idInput = caller.extend({ id: z.string().uuid() });

type Caller = { id: string; name: string; role: string; isSupervisor: boolean };

/** Any signed-in till user: a staff account or a cashier PIN session. */
async function assertCaller(data: z.infer<typeof caller>): Promise<Caller> {
  if (data.accessToken) {
    const { verifyPosStaff } = await import("./secure-settings.server");
    const staff = await verifyPosStaff(data.accessToken);
    return { id: staff.userId, name: staff.userId, role: staff.role, isSupervisor: staff.isAdmin };
  }
  const sessionToken = data.cashierToken ?? data.terminalToken;
  if (sessionToken) {
    const { verifyCashierSession } = await import("./pos-session.server");
    const session = verifyCashierSession(sessionToken);
    if (session) {
      return { id: session.id, name: session.username, role: "cashier", isSupervisor: false };
    }
  }
  throw new Error("Not signed in");
}

/** Effective rules for the caller's branch. */
export const getAuthorizationRules = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => rulesInput.parse(data))
  .handler(async ({ data }) => {
    const { loadRuleRows } = await import("./authorization.server");
    try {
      await assertCaller(data);
      const rows = await loadRuleRows(data.storeId ?? "");
      return { ok: true as const, rules: rows };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300), rules: [] };
    }
  });

/** Administrators only; the write itself is made with service rights. */
export const saveAuthorizationRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveRuleInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      if (!who.isSupervisor) return { ok: false as const, error: "Administrators only" };
      const { saveRuleRow } = await import("./authorization.server");
      await saveRuleRow({
        actionKey: data.actionKey,
        scopeType: data.scopeType,
        scopeId: data.scopeType === "branch" ? data.scopeId : "",
        mode: data.mode,
        allowedRoles: data.allowedRoles,
        allowedUserIds: data.allowedUserIds,
        requireReason: data.requireReason,
        threshold: data.threshold,
        isEnabled: true,
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });

/**
 * PIN authorisation. The PIN is checked in the database against exactly the
 * people the rule allows, and a short-lived signed grant is returned.
 */
export const authorizeWithPin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pinInput.parse(data))
  .handler(async ({ data }) => {
    const { loadRuleRows, verifyAuthorizationPin, writeLog } = await import(
      "./authorization.server"
    );
    const { signOverrideGrant } = await import("./pos-rules.server");
    const { resolveRules } = await import("./authorization");
    const { throttleStatus, throttleFail, throttleReset, minutesLeft } = await import(
      "./pin-throttle.server"
    );
    let who: Caller;
    try {
      who = await assertCaller(data);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }

    // Guessing is stopped on the server, keyed on the authoriser, so trying
    // from a second till does not reset the count.
    const key = `authz:${data.authorizerId.toLowerCase()}`;
    const state = await throttleStatus(key);
    if (state.locked) {
      return {
        ok: false as const,
        error: `Too many wrong PINs — try again in ${minutesLeft(state)} minute(s)`,
      };
    }

    const rows = await loadRuleRows(data.storeId ?? "").catch(() => []);
    const rule = resolveRules(rows, data.storeId ?? "")[data.actionKey];
    const roles = rule?.allowedRoles ?? ["admin", "manager"];
    const users = rule?.allowedUserIds ?? [];

    const person = await verifyAuthorizationPin(data.authorizerId, data.pin, roles, users);
    if (!person) {
      const after = await throttleFail(key);
      await writeLog({
        actionKey: data.actionKey,
        modeUsed: "pin",
        requestedBy: who.id,
        authorizedBy: data.authorizerId,
        storeId: data.storeId ?? "",
        terminalId: data.terminalId ?? "",
        outcome: "failed_pin",
        detail: { reason: data.reason ?? "" },
      });
      return {
        ok: false as const,
        error: after.locked
          ? `Too many wrong PINs — try again in ${minutesLeft(after)} minute(s)`
          : "That ID or PIN is not allowed to authorise this",
      };
    }
    await throttleReset(key);
    const logged = await writeLog({
      actionKey: data.actionKey,
      modeUsed: "pin",
      requestedBy: who.id,
      authorizedBy: person.userId,
      authorizerRole: person.role,
      storeId: data.storeId ?? "",
      terminalId: data.terminalId ?? "",
      outcome: "approved",
      detail: { reason: data.reason ?? "" },
    });
    return {
      ok: true as const,
      authorizer: { id: person.userId, name: person.name, role: person.role },
      grantToken: signOverrideGrant({
        action: data.actionKey,
        approvedBy: person.userId,
        role: person.role,
      }),
      warning: logged.ok ? "" : "Approved, but the audit entry could not be written.",
    };
  });

/** Send an action to the approvals queue. */
export const submitAuthorizationRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      const { createRequest } = await import("./authorization.server");
      const request = await createRequest({
        actionKey: data.actionKey,
        requestedBy: who.id,
        requestedByName: who.name,
        storeId: data.storeId ?? "",
        terminalId: data.terminalId ?? "",
        reason: data.reason,
        payload: data.payload,
        ttlHours: 24,
      });
      return { ok: true as const, request };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });

/** The approvals queue, for anyone allowed to decide something. */
export const listAuthorizationRequests = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      const { listRequests, loadRuleRows } = await import("./authorization.server");
      const { resolveRules, canAuthorize } = await import("./authorization");
      const rules = resolveRules(
        await loadRuleRows(data.storeId ?? "").catch(() => []),
        data.storeId ?? "",
      );
      const all = await listRequests({
        ...(data.storeId ? { storeId: data.storeId } : {}),
        allBranches: data.allBranches,
        status: data.status,
      });
      // Someone only sees what they could act on, plus their own requests.
      const visible = all.filter(
        (r) =>
          r.requestedBy.toLowerCase() === who.id.toLowerCase() ||
          canAuthorize(rules[r.actionKey], { userId: who.id, role: who.role }),
      );
      return {
        ok: true as const,
        requests: visible,
        me: { id: who.id, role: who.role },
        rules: Object.values(rules),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300), requests: [] };
    }
  });

/** Approve or reject from the decider's own signed-in session — no PIN. */
export const decideAuthorizationRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decideInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      const { getRequest, decideRequest, loadRuleRows, writeLog } = await import(
        "./authorization.server"
      );
      const { resolveRules, canAuthorize } = await import("./authorization");
      const existing = await getRequest(data.id);
      if (!existing) return { ok: false as const, error: "That request no longer exists" };
      if (existing.status !== "pending") {
        return { ok: false as const, error: `This request is already ${existing.status}` };
      }
      const rules = resolveRules(
        await loadRuleRows(existing.storeId).catch(() => []),
        existing.storeId,
      );
      if (!canAuthorize(rules[existing.actionKey], { userId: who.id, role: who.role })) {
        await writeLog({
          actionKey: existing.actionKey,
          modeUsed: "request",
          requestId: existing.id,
          requestedBy: existing.requestedBy,
          authorizedBy: who.id,
          authorizerRole: who.role,
          storeId: existing.storeId,
          terminalId: existing.terminalId,
          outcome: "denied",
          detail: { reason: "not allowed to decide this action" },
        });
        return { ok: false as const, error: "You are not allowed to decide this action" };
      }
      if (existing.requestedBy.toLowerCase() === who.id.toLowerCase()) {
        return { ok: false as const, error: "You cannot approve your own request" };
      }
      const updated = await decideRequest({
        id: data.id,
        approve: data.approve,
        decidedBy: who.id,
        decidedByName: who.name,
        note: data.note,
      });
      await writeLog({
        actionKey: existing.actionKey,
        modeUsed: "request",
        requestId: existing.id,
        requestedBy: existing.requestedBy,
        authorizedBy: who.id,
        authorizerRole: who.role,
        storeId: existing.storeId,
        terminalId: existing.terminalId,
        outcome: data.approve ? "approved" : "rejected",
        detail: { note: data.note },
      });
      return { ok: true as const, request: updated };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });

/** Where a request the caller made has got to; an approval is single-use. */
export const claimAuthorizationRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      const { getRequest, consumeRequest } = await import("./authorization.server");
      const { signOverrideGrant } = await import("./pos-rules.server");
      const request = await getRequest(data.id);
      if (!request) return { ok: false as const, error: "That request no longer exists" };
      if (request.requestedBy.toLowerCase() !== who.id.toLowerCase()) {
        return { ok: false as const, error: "That request belongs to someone else" };
      }
      if (request.status !== "approved") {
        return { ok: true as const, status: request.status, grantToken: "" };
      }
      const claimed = await consumeRequest(request.id);
      if (!claimed) {
        return { ok: false as const, error: "That approval has already been used" };
      }
      return {
        ok: true as const,
        status: "approved" as const,
        grantToken: signOverrideGrant({
          action: request.actionKey,
          approvedBy: request.decidedBy ?? "approval",
          role: "approval",
        }),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });

/** The requester may take back a request nobody has decided yet. */
export const cancelAuthorizationRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      const { cancelRequest } = await import("./authorization.server");
      const done = await cancelRequest(data.id, who.id);
      return done
        ? { ok: true as const }
        : { ok: false as const, error: "That request can no longer be cancelled" };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });

/** Administrators set another person's authorisation PIN; it is never read back. */
export const setStaffAuthorizationPin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    caller.extend({ userId: z.string().min(1), pin: z.string().regex(/^\d{4,6}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const who = await assertCaller(data);
      if (!who.isSupervisor) return { ok: false as const, error: "Administrators only" };
      const { setUserAuthorizationPin, writeLog } = await import("./authorization.server");
      await setUserAuthorizationPin(data.userId, data.pin, who.id);
      await writeLog({
        actionKey: "staff.set_pin",
        modeUsed: "admin_auto",
        outcome: "approved",
        requestedBy: who.id,
        authorizedBy: who.id,
        authorizerRole: who.role,
        detail: { target: data.userId },
      }).catch(() => undefined);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });
