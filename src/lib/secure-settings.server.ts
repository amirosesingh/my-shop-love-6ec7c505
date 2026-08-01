import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "./external-supabase-config";
import { decryptSetting, encryptSetting, maskSetting } from "./settings-crypto.server";

export type SecureSettingKey =
  | "whatsapp_token"
  | "whatsapp_phone_number_id"
  | "bank_account_number";

export const SECURE_SETTING_KEYS: SecureSettingKey[] = [
  "whatsapp_token",
  "whatsapp_phone_number_id",
  "bank_account_number",
];

/**
 * Verifies the caller against the POS Supabase project and returns their role.
 * The token is validated server-side; nothing the browser claims is trusted.
 */
export async function verifyPosStaff(accessToken: string): Promise<{
  userId: string;
  role: string;
  isAdmin: boolean;
}> {
  const headers = {
    apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const userRes = await fetch(`${EXTERNAL_SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userRes.ok) throw new Error("Not signed in");
  const user = (await userRes.json()) as { id: string; user_metadata?: { role?: string } };

  let role = user.user_metadata?.role ?? "staff";
  try {
    const rpc = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/current_app_user`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (rpc.ok) {
      const rows = (await rpc.json()) as unknown;
      const row = Array.isArray(rows) ? rows[0] : rows;
      const dbRole = (row as { role?: string } | null)?.role;
      if (dbRole) role = dbRole;
    }
  } catch {
    /* fall back to the token's metadata role */
  }

  return { userId: user.id, role, isAdmin: role === "admin" || role === "manager" };
}

/* ------------------------- encrypted value store ------------------------- */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function writeSecureSetting(
  key: SecureSettingKey,
  plaintext: string,
  updatedBy: string,
) {
  const supabase = await admin();
  const { error } = await supabase.from("secure_settings").upsert(
    {
      key,
      ciphertext: encryptSetting(plaintext),
      hint: maskSetting(plaintext),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
  if (error) throw error;
}

export async function removeSecureSetting(key: SecureSettingKey) {
  const supabase = await admin();
  const { error } = await supabase.from("secure_settings").delete().eq("key", key);
  if (error) throw error;
}

/** Masked view for the UI — plaintext never leaves the server. */
export async function listSecureSettingHints() {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("secure_settings")
    .select("key, hint, updated_at, updated_by");
  if (error) throw error;
  return (data ?? []) as { key: string; hint: string | null; updated_at: string; updated_by: string | null }[];
}

/** Server-only plaintext read, used by the handlers that call the provider. */
export async function readSecureSetting(key: SecureSettingKey): Promise<string | null> {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("secure_settings")
    .select("ciphertext")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  try {
    return decryptSetting((data as { ciphertext: string }).ciphertext);
  } catch {
    return null;
  }
}