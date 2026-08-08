/**
 * Hidden per-terminal cloud account.
 *
 * A till that is signed in with a username + PIN has no account on the central
 * database, so every direct write is refused. Once a terminal is activated it
 * is given its own machine account (never shown to staff) with the staff role,
 * so ordinary writes succeed under the normal row rules. The relay stays as a
 * fallback for tills that cannot hold a session.
 */
import { createHmac } from "node:crypto";
import { supabaseConfig } from "./external-supabase-config";
import { serviceRest, serviceKey } from "./pos-relay.server";

export type TerminalAccount = { email: string; password: string };

const emailFor = (tokenId: string) => `terminal.${tokenId}@pos.local`;

/** Deterministic password so the same terminal always recovers its account. */
function passwordFor(tokenId: string): string {
  const secret = process.env["SETTINGS_ENCRYPTION_KEY"];
  if (!secret) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
  return `T${createHmac("sha256", secret).update(`terminal:${tokenId}`).digest("base64url").slice(0, 40)}`;
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!key.startsWith("sb_")) headers["Authorization"] = `Bearer ${key}`;
  return fetch(`${supabaseConfig().url}/auth/v1/${path}`, { ...init, headers });
}

/**
 * Create (or repair) the machine account for an activated terminal and return
 * the credentials the till should keep encrypted on the device.
 */
export async function ensureTerminalAccount(tokenId: string): Promise<TerminalAccount> {
  const tokenRes = await serviceRest(
    `terminal_tokens?id=eq.${encodeURIComponent(tokenId)}&select=id,status,location_id,location_name`,
  );
  if (!tokenRes.ok) throw new Error("Could not reach the central database");
  const token = ((await tokenRes.json()) as {
    status?: string;
    location_id?: string | null;
    location_name?: string | null;
  }[])[0];
  if (!token || (token.status !== "active" && token.status !== "used")) {
    throw new Error("This terminal is not activated");
  }

  const email = emailFor(tokenId);
  const password = passwordFor(tokenId);

  const created = await adminFetch("admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        terminal_token: tokenId,
        full_name: `Terminal ${token.location_name ?? tokenId.slice(0, 8)}`,
        store_id: token.location_id ?? null,
      },
    }),
  });

  let userId: string | null = null;
  if (created.ok) {
    userId = ((await created.json()) as { id?: string }).id ?? null;
  } else {
    // Already exists: look it up and reset the password to the derived value.
    const list = await adminFetch(`admin/users?page=1&per_page=1&email=${encodeURIComponent(email)}`);
    if (list.ok) {
      const body = (await list.json()) as { users?: { id: string; email?: string }[] };
      userId = body.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    }
    if (!userId) throw new Error("Could not prepare this terminal's account");
    await adminFetch(`admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true }),
    });
  }

  if (userId) {
    await serviceRest("app_users?on_conflict=user_id", {
      method: "POST",
      prefer: "return=minimal,resolution=merge-duplicates",
      body: JSON.stringify([
        {
          user_id: `terminal-${tokenId.slice(0, 8)}`,
          full_name: `Terminal ${token.location_name ?? tokenId.slice(0, 8)}`,
          email,
          role: "staff",
          store_id: token.location_id ?? null,
          auth_user_id: userId,
          is_active: true,
        },
      ]),
    });
    await serviceRest("user_roles?on_conflict=user_id,role", {
      method: "POST",
      prefer: "return=minimal,resolution=merge-duplicates",
      body: JSON.stringify([{ user_id: userId, role: "staff" }]),
    });
  }

  return { email, password };
}