/**
 * Only supervisors and above may read the edit history, so the signed-in
 * user's role is re-checked on the server for every request.
 */
import { serviceRest } from "./pos-relay.server";

const SUPERVISOR_ROLES = new Set(["admin", "owner", "manager", "supervisor"]);

export async function verifySupervisorToken(accessToken: string): Promise<boolean> {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return false;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return false;
  const user = (await res.json()) as { id?: string };
  if (!user.id) return false;
  const rows = await serviceRest(
    `app_users?auth_user_id=eq.${encodeURIComponent(user.id)}&select=role,role_slug,is_active`,
  );
  if (!rows.ok) return false;
  const list = (await rows.json()) as {
    role?: string;
    role_slug?: string | null;
    is_active?: boolean;
  }[];
  return list.some(
    (r) =>
      r.is_active !== false &&
      (SUPERVISOR_ROLES.has(String(r.role ?? "")) ||
        SUPERVISOR_ROLES.has(String(r.role_slug ?? ""))),
  );
}
