/**
 * The signed-in administrator's access token, in one place.
 *
 * Screens that change central-only settings need the admin's own token, and
 * they all need the same answer when there isn't one: a plain sentence rather
 * than a silent failure or a queued write that would never be safe to replay.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { isConnectionError } from "@/core/local-db/db-mode";

/** Wording used whenever a central-only change cannot be attempted. */
export const ADMIN_SIGN_IN_MESSAGE = "Sign in with an admin account to change this.";
export const ADMIN_OFFLINE_MESSAGE =
  "Connection is down. This setting is held centrally, so it can only be changed once the line is back.";

/** The token, or an empty string when nobody suitable is signed in. */
export async function adminAccessToken(): Promise<string> {
  try {
    const { data } = await supabaseExternal.auth.getSession();
    return data.session?.access_token ?? "";
  } catch {
    return "";
  }
}

/** The token plus the reason it is missing, ready to show the operator. */
export async function requireAdminToken(): Promise<
  { ok: true; token: string } | { ok: false; message: string }
> {
  try {
    const { data } = await supabaseExternal.auth.getSession();
    const token = data.session?.access_token ?? "";
    if (!token) return { ok: false, message: ADMIN_SIGN_IN_MESSAGE };
    return { ok: true, token };
  } catch (e) {
    return {
      ok: false,
      message: isConnectionError(e) ? ADMIN_OFFLINE_MESSAGE : ADMIN_SIGN_IN_MESSAGE,
    };
  }
}
