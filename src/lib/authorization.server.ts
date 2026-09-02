/**
 * Server-only side of the authorisation framework.
 *
 * Rules, approval requests and the log are read and written here with the
 * internal service key, so the browser can never edit a rule, decide its own
 * request, or write its own audit entry.
 */
import {
  normalizeRequest,
  normalizeRule,
  type AuthorizationRequest,
  type AuthorizationRule,
  type AuthPayload,
} from "./authorization";

type Row = Record<string, unknown>;

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  return serviceRest(path, init);
}

async function readRows(path: string): Promise<Row[]> {
  const res = await rest(path);
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || "Read failed");
  return (await res.json()) as Row[];
}

// ------------------------------------------------------------------ rules

/** Global rows plus the branch's own rows. */
export async function loadRuleRows(storeId: string): Promise<AuthorizationRule[]> {
  const scope = storeId
    ? `or=(scope_id.eq.,scope_id.eq.${encodeURIComponent(storeId)})`
    : `scope_id=eq.`;
  const rows = await readRows(`authorization_actions?select=*&${scope}`);
  return rows.map(normalizeRule);
}

export async function saveRuleRow(rule: {
  actionKey: string;
  scopeType: string;
  scopeId: string;
  mode: string;
  allowedRoles: string[];
  allowedUserIds: string[];
  requireReason: boolean;
  threshold: number | null;
  isEnabled: boolean;
}): Promise<void> {
  const res = await rest("authorization_actions?on_conflict=action_key,scope_type,scope_id", {
    method: "POST",
    body: JSON.stringify([
      {
        action_key: rule.actionKey,
        scope_type: rule.scopeType,
        scope_id: rule.scopeId,
        mode: rule.mode,
        allowed_roles: rule.allowedRoles,
        allowed_user_ids: rule.allowedUserIds,
        require_reason: rule.requireReason,
        threshold: rule.threshold,
        is_enabled: rule.isEnabled,
        updated_at: new Date().toISOString(),
      },
    ]),
    prefer: "return=minimal,resolution=merge-duplicates",
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || "Could not save the rule");
}

// -------------------------------------------------------------------- log

export async function writeLog(entry: {
  actionKey: string;
  modeUsed: "pin" | "request" | "admin_auto";
  requestId?: string | null;
  requestedBy?: string | null;
  authorizedBy?: string | null;
  authorizerRole?: string | null;
  storeId?: string | null;
  terminalId?: string | null;
  outcome: "approved" | "rejected" | "failed_pin" | "denied";
  detail?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await rest("authorization_log", {
      method: "POST",
      body: JSON.stringify([
        {
          action_key: entry.actionKey,
          mode_used: entry.modeUsed,
          request_id: entry.requestId ?? null,
          requested_by: entry.requestedBy ?? null,
          authorized_by: entry.authorizedBy ?? null,
          authorizer_role: entry.authorizerRole ?? null,
          store_id: entry.storeId ?? "",
          terminal_id: entry.terminalId ?? "",
          outcome: entry.outcome,
          detail: entry.detail ?? {},
        },
      ]),
      prefer: "return=minimal",
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    return { ok: true };
  } catch (e) {
    // An action is never blocked on its audit write, but the caller is told
    // so it can be shown as unrecorded rather than silently lost.
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

// --------------------------------------------------------------- requests

export async function createRequest(input: {
  actionKey: string;
  requestedBy: string;
  requestedByName: string;
  storeId: string;
  terminalId: string;
  reason: string;
  payload: AuthPayload;
  ttlHours: number;
}): Promise<AuthorizationRequest> {
  const res = await rest("authorization_requests", {
    method: "POST",
    body: JSON.stringify([
      {
        action_key: input.actionKey,
        requested_by: input.requestedBy,
        requested_by_name: input.requestedByName,
        store_id: input.storeId,
        terminal_id: input.terminalId,
        reason: input.reason,
        payload: input.payload,
        status: "pending",
        expires_at: new Date(Date.now() + input.ttlHours * 3600_000).toISOString(),
      },
    ]),
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || "Could not send the request");
  const rows = (await res.json()) as Row[];
  return normalizeRequest(rows[0]);
}

/** Anything still pending past its window is reported as expired. */
const withExpiry = (r: AuthorizationRequest): AuthorizationRequest =>
  r.status === "pending" && r.expiresAt && Date.parse(r.expiresAt) < Date.now()
    ? { ...r, status: "expired" }
    : r;

export async function listRequests(opts: {
  storeId?: string;
  allBranches: boolean;
  status?: string;
  limit?: number;
}): Promise<AuthorizationRequest[]> {
  const parts = [
    "select=*",
    `order=created_at.desc`,
    `limit=${Math.min(Math.max(opts.limit ?? 100, 1), 300)}`,
  ];
  if (!opts.allBranches && opts.storeId) {
    parts.push(`or=(store_id.eq.${encodeURIComponent(opts.storeId)},store_id.eq.)`);
  }
  if (opts.status && opts.status !== "all") parts.push(`status=eq.${opts.status}`);
  const rows = await readRows(`authorization_requests?${parts.join("&")}`);
  return rows.map(normalizeRequest).map(withExpiry);
}

export async function getRequest(id: string): Promise<AuthorizationRequest | null> {
  const rows = await readRows(
    `authorization_requests?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] ? withExpiry(normalizeRequest(rows[0])) : null;
}

export async function decideRequest(input: {
  id: string;
  approve: boolean;
  decidedBy: string;
  decidedByName: string;
  note: string;
}): Promise<AuthorizationRequest | null> {
  const res = await rest(
    `authorization_requests?id=eq.${encodeURIComponent(input.id)}&status=eq.pending`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: input.approve ? "approved" : "rejected",
        decided_by: input.decidedBy,
        decided_by_name: input.decidedByName,
        decided_at: new Date().toISOString(),
        decision_note: input.note,
      }),
      prefer: "return=representation",
    },
  );
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || "Could not record the decision");
  const rows = (await res.json()) as Row[];
  return rows[0] ? normalizeRequest(rows[0]) : null;
}

/** A granted request may only be used once. */
export async function consumeRequest(id: string): Promise<boolean> {
  const res = await rest(
    `authorization_requests?id=eq.${encodeURIComponent(id)}&status=eq.approved&consumed_at=is.null`,
    {
      method: "PATCH",
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      prefer: "return=representation",
    },
  );
  if (!res.ok) return false;
  return ((await res.json()) as Row[]).length > 0;
}

export async function cancelRequest(id: string, requestedBy: string): Promise<boolean> {
  const res = await rest(
    `authorization_requests?id=eq.${encodeURIComponent(id)}&status=eq.pending&requested_by=eq.${encodeURIComponent(requestedBy)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", decided_at: new Date().toISOString() }),
      prefer: "return=representation",
    },
  );
  if (!res.ok) return false;
  return ((await res.json()) as Row[]).length > 0;
}

// -------------------------------------------------------------------- PIN

/**
 * Check a PIN against exactly the people the rule allows. The comparison
 * happens inside the database; nothing comes back on a failure.
 */
export async function verifyAuthorizationPin(
  userId: string,
  pin: string,
  allowedRoles: string[],
  allowedUsers: string[],
): Promise<{ userId: string; name: string; role: string } | null> {
  const { rpc } = await import("./pos-rules.server");
  try {
    const rows = await rpc<unknown>("authorization_verify_pin", {
      p_user_id: userId,
      p_pin: pin,
      p_allowed_roles: allowedRoles,
      p_allowed_users: allowedUsers,
    });
    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | { user_id?: string; full_name?: string; role?: string }
      | undefined;
    if (!row?.user_id) return null;
    return { userId: row.user_id, name: row.full_name || row.user_id, role: row.role ?? "manager" };
  } catch {
    return null;
  }
}

/** Set (or clear) a person's authorisation PIN. Hashing happens in the database. */
export async function setUserAuthorizationPin(
  targetUserId: string,
  pin: string,
  setBy: string,
): Promise<void> {
  const { rpc } = await import("./pos-rules.server");
  await rpc<unknown>("set_authorization_pin", {
    p_user_id: targetUserId,
    p_pin: pin,
    p_set_by: setBy,
  });
}
