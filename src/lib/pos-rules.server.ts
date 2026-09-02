/**
 * Server-only helpers behind the POS rules engine.
 *
 * Everything here talks to the POS database directly and never trusts a
 * client payload: manager PINs are verified through the database, and the
 * grant token handed back is signed so a later call can prove an override
 * really happened.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { supabaseConfig } from "./external-supabase-config";
import { DEFAULT_POS_RULES, normalizeRules, type PosRules } from "./pos-rules";

const GRANT_TTL_MS = 5 * 60 * 1000;

function secret(): Buffer {
  const raw = process.env["SETTINGS_ENCRYPTION_KEY"];
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(raw, "utf8").digest();
}

export type OverrideGrant = { action: string; approvedBy: string; role: string; exp: number };

export function signOverrideGrant(grant: Omit<OverrideGrant, "exp">): string {
  const body = Buffer.from(
    JSON.stringify({ ...grant, exp: Date.now() + GRANT_TTL_MS }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOverrideGrant(token: string | undefined, action: string): OverrideGrant | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OverrideGrant;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.action !== action) return null;
    return parsed;
  } catch {
    return null;
  }
}

function headers(accessToken?: string): Record<string, string> {
  return {
    apikey: supabaseConfig().key,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

/**
 * Call a rules routine on the central database.
 *
 * These routines run with elevated rights, so they are no longer reachable by
 * visitors: the call is made here with the internal service key, which never
 * leaves the server. The publishable key is only used as a last resort when
 * the service key is not configured on this deployment.
 */
export async function rpc<T>(name: string, body: unknown, accessToken?: string): Promise<T> {
  const payload = JSON.stringify(body ?? {});
  let res: Response;
  if (accessToken) {
    res = await fetch(`${supabaseConfig().url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(accessToken),
      body: payload,
    });
  } else {
    const { serviceRest } = await import("@/core/api/pos-relay.server");
    res = await serviceRest(`rpc/${name}`, { method: "POST", body: payload });
  }
  if (!res.ok) throw new Error((await res.text()) || `${name} failed`);
  return (await res.json()) as T;
}

/** Where an answer came from, so the UI can say when rules are not live. */
export type RulesSource = "database" | "defaults";

export type RulesResult = { rules: PosRules; source: RulesSource; error?: string };

/**
 * Effective rule set for a branch (store row layered over the global row).
 *
 * A failure still returns the strict built-in defaults so the till keeps
 * working, but it is reported rather than hidden.
 */
export async function loadRulesResult(storeId: string): Promise<RulesResult> {
  try {
    const json = await rpc<unknown>("pos_rules_get", { _store_id: storeId || "" });
    return { rules: normalizeRules(json), source: "database" };
  } catch (e) {
    return {
      rules: { ...DEFAULT_POS_RULES },
      source: "defaults",
      error: (e as Error).message.slice(0, 300),
    };
  }
}

export async function loadRules(storeId: string): Promise<PosRules> {
  return (await loadRulesResult(storeId)).rules;
}

export async function saveRules(
  storeId: string,
  patch: Partial<PosRules>,
  accessToken: string,
): Promise<PosRules> {
  // The caller was already proved to be a supervisor on the server. The
  // routine re-checks for a signed-in supervisor, which the service role is
  // not, so the branch row is written directly with service rights.
  try {
    const { serviceRest } = await import("@/core/api/pos-relay.server");
    const res = await serviceRest("pos_store_settings?on_conflict=store_id", {
      method: "POST",
      body: JSON.stringify([{ store_id: storeId || "", ...patch }]),
      prefer: "return=minimal,resolution=merge-duplicates",
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 400) || "Could not save rules");
    return await loadRules(storeId);
  } catch (e) {
    // No service key on this deployment: fall back to the supervisor's own
    // session, which the routine accepts.
    const body = { _store_id: storeId || "", _patch: patch };
    const res = await fetch(`${supabaseConfig().url}/rest/v1/rpc/pos_rules_save`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 400) || (e as Error).message);
    return normalizeRules(await res.json());
  }
}

export async function verifyManagerPinInDb(
  userId: string,
  pin: string,
  audit?: {
    action?: string | null;
    ruleKey?: string | null;
    requestedBy?: string | null;
    storeId?: string | null;
    terminalId?: string | null;
    detail?: string | null;
  },
): Promise<{ userId: string; name: string; role: string } | null> {
  try {
    const rows = await rpc<unknown>("verify_manager_pin", {
      p_user_id: userId,
      p_pin: pin,
      p_action: audit?.action ?? null,
      p_rule_key: audit?.ruleKey ?? null,
      p_requested_by: audit?.requestedBy ?? null,
      p_store_id: audit?.storeId ?? null,
      p_terminal_id: audit?.terminalId ?? null,
      p_detail: audit?.detail ?? null,
    });
    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | { user_id?: string; full_name?: string; role?: string }
      | undefined;
    if (!row?.user_id) return null;
    return { userId: row.user_id, name: row.full_name ?? row.user_id, role: row.role ?? "manager" };
  } catch {
    return null;
  }
}

export async function logOverride(input: {
  action: string;
  ruleKey?: string | null;
  requestedBy?: string | null;
  approvedBy: string;
  approvedRole: string;
  storeId?: string | null;
  terminalId?: string | null;
  detail?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await rpc("log_manager_override", {
      _action: input.action,
      _rule_key: input.ruleKey ?? null,
      _requested_by: input.requestedBy ?? null,
      _approved_by: input.approvedBy,
      _approved_role: input.approvedRole,
      _store_id: input.storeId ?? null,
      _terminal_id: input.terminalId ?? null,
      _detail: input.detail ?? null,
    });
    return { ok: true };
  } catch (e) {
    // The till is never blocked on an audit write, but the caller is told so
    // the approval can be shown as unrecorded instead of silently lost.
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

/**
 * Open held tickets for a branch. A failure is reported, never counted as
 * zero — closing a shift must not slip through because the count was lost.
 */
export async function heldOrderCountResult(
  storeId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const n = await rpc<unknown>("held_orders_open_count", { _store_id: storeId || "" });
    return { ok: true, count: Number(n) || 0 };
  } catch (e) {
    return { ok: false, count: 0, error: (e as Error).message.slice(0, 300) };
  }
}

export async function heldOrderCount(storeId: string): Promise<number> {
  return (await heldOrderCountResult(storeId)).count;
}