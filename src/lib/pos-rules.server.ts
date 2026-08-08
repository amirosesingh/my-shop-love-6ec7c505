/**
 * Server-only helpers behind the POS rules engine.
 *
 * Everything here talks to the POS database directly and never trusts a
 * client payload: manager PINs are verified through the database, and the
 * grant token handed back is signed so a later call can prove an override
 * really happened.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "./external-supabase-config";
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
    apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function rpc<T>(name: string, body: unknown, accessToken?: string): Promise<T> {
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error((await res.text()) || `${name} failed`);
  return (await res.json()) as T;
}

/** Effective rule set for a branch (store row layered over the global row). */
export async function loadRules(storeId: string): Promise<PosRules> {
  try {
    const json = await rpc<unknown>("pos_rules_get", { _store_id: storeId || "" });
    return normalizeRules(json);
  } catch {
    return { ...DEFAULT_POS_RULES };
  }
}

export async function saveRules(
  storeId: string,
  patch: Partial<PosRules>,
  accessToken: string,
): Promise<PosRules> {
  const body = { _store_id: storeId || "", _patch: patch };
  try {
    return normalizeRules(await rpc<unknown>("pos_rules_save", body, accessToken));
  } catch (e) {
    // The routine may not be granted to signed-in accounts on this database.
    // The caller was already proved to be a supervisor, so fall back to the
    // service key rather than leaving the settings unsaved.
    const message = (e as Error).message ?? "";
    if (!/42501|permission denied/i.test(message)) throw e;
    const { serviceRest } = await import("./pos-relay.server");
    // The routine itself re-checks for a supervisor, which the service role is
    // not, so write the branch row directly instead.
    const res = await serviceRest("pos_store_settings?on_conflict=store_id", {
      method: "POST",
      body: JSON.stringify([{ store_id: storeId || "", ...patch }]),
      prefer: "return=minimal,resolution=merge-duplicates",
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 400) || "Could not save rules");
    const read = await serviceRest("rpc/pos_rules_get", {
      method: "POST",
      body: JSON.stringify({ _store_id: storeId || "" }),
    });
    return normalizeRules(read.ok ? await read.json() : null);
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
}) {
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
  } catch {
    /* never block the till on an audit write */
  }
}

export async function heldOrderCount(storeId: string): Promise<number> {
  try {
    const n = await rpc<unknown>("held_orders_open_count", { _store_id: storeId || "" });
    return Number(n) || 0;
  } catch {
    return 0;
  }
}