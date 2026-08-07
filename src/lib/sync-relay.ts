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

export function canRelay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      !!window.sessionStorage.getItem(TERMINAL_TOKEN_KEY) || !!readTerminalConfig()?.tokenId
    );
  } catch {
    return !!readTerminalConfig()?.tokenId;
  }
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
export async function probeRelay(): Promise<{ ok: boolean; error?: string }> {
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
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: body?.error ?? `Relay error ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}