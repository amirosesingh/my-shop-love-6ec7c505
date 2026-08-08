/**
 * Keeps an activated till signed in to the central database with its own
 * machine account, so writes made during a cashier PIN shift are accepted
 * normally instead of being refused by the row rules.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { claimTerminalToken } from "./terminal-account.functions";
import { getDeviceSecret, setDeviceSecret, clearDeviceSecret } from "./device-secrets";
import { readTerminalConfig } from "./terminal-tokens";
import { deviceMeta, readDeviceProof } from "./terminal-proof";
import { readDesktopCredentials, writeDesktopCredentials } from "./terminal-desktop-store";

type Account = { email: string; password: string };

const SECRET = "terminal-account";

export function clearTerminalCredentials(): void {
  clearDeviceSecret(SECRET);
  void writeDesktopCredentials(null);
}

/**
 * Fetch (once) and remember this terminal's machine account, encrypted.
 * Requires the one-time device proof kept from the claim.
 */
export async function provisionTerminalAccount(tokenId: string): Promise<Account | null> {
  const deviceProof = await readDeviceProof();
  if (!deviceProof) return null;
  const res = await claimTerminalToken({
    data: { tokenId, deviceProof, device: deviceMeta() },
  }).catch(() => null);
  if (!res?.ok) return null;
  const account: Account = { email: res.email, password: res.password };
  await setDeviceSecret(SECRET, account);
  void writeDesktopCredentials(account);
  return account;
}

/**
 * Make sure there is a live cloud session for this till. Returns true when the
 * terminal is signed in (either already, or after signing in as the machine
 * account). Failures are silent — the server relay still carries the writes.
 */
export async function ensureTerminalSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const current = (await supabaseExternal.auth.getSession()).data.session;
    if (current) return true;

    const tokenId = readTerminalConfig()?.tokenId;
    if (!tokenId) return false;

    let account = await getDeviceSecret<Account>(SECRET);
    // An installer refresh can wipe renderer storage; the desktop shell keeps
    // its own protected copy so the till does not have to be paired again.
    if (!account) {
      account = await readDesktopCredentials();
      if (account) await setDeviceSecret(SECRET, account);
    }
    if (!account) account = await provisionTerminalAccount(tokenId);
    if (!account) return false;

    const { error } = await supabaseExternal.auth.signInWithPassword(account);
    if (!error) return true;

    // Credentials rotated or the account was rebuilt — re-provision once.
    const fresh = await provisionTerminalAccount(tokenId);
    if (!fresh) return false;
    const retry = await supabaseExternal.auth.signInWithPassword(fresh);
    return !retry.error;
  } catch {
    return false;
  }
}
