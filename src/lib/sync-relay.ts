/**
 * Client side of the server write relay.
 *
 * When a direct write to the central database is refused because the till has
 * no cloud account (cashier PIN sign-in), the same operation is posted to
 * `/api/public/sync`, which proves the caller and writes with service rights.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { TERMINAL_TOKEN_KEY } from "./pos-caller-auth";
import { readTerminalConfig } from "./terminal-tokens";
import type { SyncOp } from "./sync-outbox";

async function credentials() {
  let cashierToken: string | undefined;
  try {
    cashierToken = window.sessionStorage.getItem(TERMINAL_TOKEN_KEY) ?? undefined;
  } catch {
    /* session storage unavailable */
  }
  let accessToken: string | undefined;
  try {
    accessToken = (await supabaseExternal.auth.getSession()).data.session?.access_token;
  } catch {
    /* offline */
  }
  const terminalToken = readTerminalConfig()?.tokenId;
  return {
    ...(cashierToken ? { cashierToken } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(terminalToken ? { terminalToken } : {}),
  };
}

/** True when a staff account is signed in to the central database in this browser. */
export function hasStaffSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("sb-external-auth-token");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { access_token?: string } | null;
    return !!parsed?.access_token;
  } catch {
    return false;
  }
}

/**
 * Whether the server write relay may be used. Activated tills qualify, and so
 * does any browser with a signed-in staff account — admins and supervisors work
 * from Chrome, where no till is registered. The endpoint still proves the
 * caller before writing, so this never opens an anonymous path.
 */
export function canRelay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(TERMINAL_TOKEN_KEY)) return true;
  } catch {
    /* session storage unavailable */
  }
  return !!readTerminalConfig()?.tokenId || hasStaffSession();
}

/** Push one operation through the relay. */
export async function relayOp(op: SyncOp): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/public/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(await credentials()), ops: [op] }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; results?: { ok: boolean; error?: string }[] }
      | null;
    if (!res.ok) return { ok: false, error: body?.error ?? `Relay refused (${res.status})` };
    const first = body?.results?.[0];
    return first ?? { ok: !!body?.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Quick health probe used by the connection check panel. */
export async function relayActiveShift(
  storeId: string,
): Promise<{ ok: boolean; row?: Record<string, unknown> | null; error?: string }> {
  try {
    const res = await fetch("/api/public/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(await credentials()), read: { kind: "activeShift", storeId } }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; row?: Record<string, unknown> | null; error?: string }
      | null;
    if (!res.ok || !body?.ok)
      return { ok: false, error: body?.error ?? `Relay refused (${res.status})` };
    return { ok: true, row: body.row ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Protected branch-list read for startup and terminal administration. */
export async function relayStores(): Promise<{
  ok: boolean;
  rows?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/public/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(await credentials()), read: { kind: "stores" } }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; rows?: Record<string, unknown>[]; error?: string }
      | null;
    if (!res.ok || !body?.ok)
      return { ok: false, error: body?.error ?? `Relay refused (${res.status})` };
    return { ok: true, rows: body.rows ?? [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Quick health probe used by the connection check panel. */
export async function probeRelay(): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/public/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(await credentials()),
        ops: [{ kind: "update", table: "shift_sessions", values: {}, match: { id: "probe" } }],
      }),
    });
    if (res.status === 401) return { ok: false, error: "This till is not recognised yet" };
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    if (!res.ok)
      return {
        ok: false,
        ...(body?.code ? { code: body.code } : {}),
        error: body?.error ?? `Relay error ${res.status}`,
      };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}