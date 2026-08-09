/**
 * The one place that holds this device's proof of identity.
 *
 * Three credentials can exist at once:
 *  - `cashierToken` — signed session minted after a username + PIN sign-in
 *  - `terminalToken` — the activation token id of a registered till
 *  - `accessToken`  — the staff account's bearer token from the central database
 *
 * They are kept in the encrypted device store (AES-GCM, key generated once per
 * device) rather than `sessionStorage`, so a reload, an app update or a resume
 * from background does not lose the sign-in — and clearing it really clears it.
 * The desktop and Android shells mirror the same sealed value through their own
 * secure stores.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { clearDeviceSecret, getDeviceSecret, setDeviceSecret } from "./device-secrets";

const SECRET = "cashier-session";
/** Legacy location; read once so an existing sign-in survives the upgrade. */
export const TERMINAL_TOKEN_KEY = "pos-terminal-token-v1";

let cached: string | null = null;
let loaded = false;

function legacyToken(): string | null {
  try {
    return window.sessionStorage.getItem(TERMINAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Read the cashier session token, hydrating the encrypted store on first use. */
export async function loadCashierToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (loaded) return cached;
  loaded = true;
  const stored = await getDeviceSecret<string>(SECRET);
  if (stored) {
    cached = stored;
    return cached;
  }
  const legacy = legacyToken();
  if (legacy) {
    cached = legacy;
    await setDeviceSecret(SECRET, legacy).catch(() => undefined);
  }
  return cached;
}

/** Last known cashier token without waiting on the encrypted store. */
export function cashierTokenSync(): string | null {
  if (typeof window === "undefined") return null;
  return cached ?? legacyToken();
}

export async function saveCashierToken(token: string): Promise<void> {
  cached = token;
  loaded = true;
  try {
    window.sessionStorage.setItem(TERMINAL_TOKEN_KEY, token);
  } catch {
    /* session storage unavailable */
  }
  await setDeviceSecret(SECRET, token).catch(() => undefined);
}

/** Wipe every stored credential on this device. */
export function clearStoredCredentials(): void {
  cached = null;
  loaded = true;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TERMINAL_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  clearDeviceSecret(SECRET);
}

/** Activation token id of the till this app is registered to, if any. */
export function terminalTokenSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Imported lazily through the module cache to avoid a cycle at load time.
    const mod = require("./terminal-tokens") as typeof import("./terminal-tokens");
    return mod.readTerminalConfig()?.tokenId ?? null;
  } catch {
    return null;
  }
}

export type PosCredentials = {
  cashierToken?: string;
  terminalToken?: string;
  accessToken?: string;
};

/** Everything this device can present, each under its correct name. */
export async function readCredentials(): Promise<PosCredentials> {
  if (typeof window === "undefined") return {};
  const cashierToken = (await loadCashierToken()) ?? undefined;
  let accessToken: string | undefined;
  try {
    accessToken = (await supabaseExternal.auth.getSession()).data.session?.access_token;
  } catch {
    /* offline */
  }
  let terminalToken: string | undefined;
  try {
    const { readTerminalConfig } = await import("./terminal-tokens");
    terminalToken = readTerminalConfig()?.tokenId ?? undefined;
  } catch {
    /* no till registered */
  }
  return {
    ...(cashierToken ? { cashierToken } : {}),
    ...(terminalToken ? { terminalToken } : {}),
    ...(accessToken ? { accessToken } : {}),
  };
}

/** Headers for a call to our own server: the bearer travels with every request. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { accessToken } = await readCredentials();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
