// Cashiers live in public.cashiers — plain rows with a hashed 6-digit PIN and
// no Supabase Auth account. Supervisors/admins keep their email accounts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { normalizePermissions, type StaffPermissions } from "@/lib/permissions";

const sb = supabaseExternal as unknown as SupabaseClient;

export type CashierRow = {
  id: string;
  username: string;
  full_name: string;
  /** Assigned role (built-in or custom). Older databases return nothing. */
  role_slug: string | null;
  permissions: StaffPermissions;
  is_active: boolean;
  last_login_at: string | null;
};

export const cashierErrText = (e: unknown): string => {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const o = e as { message?: string; details?: string; hint?: string; code?: string };
  return o.message || o.details || o.hint || o.code || "Unexpected error";
};

const mapRow = (r: Record<string, unknown>): CashierRow => ({
  id: String(r["id"] ?? ""),
  username: String(r["username"] ?? ""),
  full_name: String(r["full_name"] ?? ""),
  role_slug: (r["role_slug"] as string | null) ?? null,
  permissions: normalizePermissions(
    r["permissions"] as Record<string, unknown> | null,
    "cashier",
  ),
  is_active: r["is_active"] !== false,
  last_login_at: (r["last_login_at"] as string | null) ?? null,
});

export async function listCashiers(): Promise<CashierRow[]> {
  const { data, error } = await sb.rpc("list_cashiers");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export async function upsertCashier(opts: {
  id?: string | null;
  username: string;
  fullName: string;
  pin?: string;
  isActive?: boolean;
}): Promise<string> {
  const { data, error } = await sb.rpc("upsert_cashier", {
    p_id: opts.id ?? null,
    p_username: opts.username.trim().toLowerCase(),
    p_full_name: opts.fullName.trim(),
    p_pin: opts.pin ?? "",
    p_is_active: opts.isActive ?? true,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function setCashierPermissions(
  id: string,
  permissions: Record<string, boolean>,
) {
  const { error } = await sb.rpc("set_cashier_permissions", {
    p_id: id,
    p_permissions: permissions,
  });
  if (error) throw error;
}

/** Assign a built-in or custom role to a cashier. */
export async function setCashierRoleSlug(id: string, roleSlug: string) {
  const { error } = await sb.rpc("set_cashier_role_slug", {
    p_id: id,
    p_role_slug: roleSlug,
  });
  if (error) throw error;
}

export async function deleteCashier(id: string) {
  const { error } = await sb.rpc("delete_cashier", { p_id: id });
  if (error) throw error;
}

/** Terminal sign-in. Returns null when the username/PIN pair does not match. */
export async function verifyCashierPin(username: string, pin: string) {
  const { data, error } = await sb.rpc("verify_cashier_pin", {
    p_username: username.trim().toLowerCase(),
    p_pin: pin,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
