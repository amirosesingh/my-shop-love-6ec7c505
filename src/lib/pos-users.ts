// Account provisioning helpers. All accounts (cashiers, supervisors, admins)
// live in Supabase Authentication; the role is stored in user_metadata.role.
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./external-supabase-config";

export type MetaRole = "cashier" | "warehouse" | "supervisor" | "admin";

// Cashiers do NOT get a Supabase Auth account. They live in public.cashiers
// with a server-side hashed PIN verified through the verify_cashier_pin RPC,
// so no login password is ever derived from the low-entropy PIN.

const signupFetch: typeof fetch = (input, init) => {
  const SUPABASE_PUBLISHABLE_KEY = supabaseConfig().key;
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );
  if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) {
    headers.delete("Authorization");
  }
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  return fetch(input, { ...init, headers });
};

/**
 * Isolated client used only to create accounts, so provisioning a new user
 * never replaces the supervisor's own session.
 */
function provisioningClient() {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    global: { fetch: signupFetch },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

type CreateResult = { ok: boolean; error?: string; needsConfirmation?: boolean };

async function createAccount(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
): Promise<CreateResult> {
  const client = provisioningClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) {
    const message = error.message === "Database error saving new user"
      ? "The authentication profile sync failed. Please try again or contact your administrator."
      : error.message;
    return { ok: false, error: message };
  }
  return { ok: true, needsConfirmation: !data.session };
}

export function createSupervisorAccount(opts: {
  email: string;
  fullName: string;
  password: string;
  role: Extract<MetaRole, "supervisor" | "admin">;
}) {
  return createAccount(opts.email.trim(), opts.password, {
    role: opts.role,
    full_name: opts.fullName.trim(),
  });
}

/** Every account (cashier, supervisor, admin) signs in with email + password. */
export function createStaffAccount(opts: {
  email: string;
  fullName: string;
  password: string;
  role: MetaRole;
  storeId?: string | null;
}) {
  return createAccount(opts.email.trim(), opts.password, {
    role: opts.role,
    full_name: opts.fullName.trim(),
    store_id: opts.storeId ?? null,
  });
}

/** Stable app_users key derived from the login email. */
export const staffUserId = (email: string) =>
  (email.trim().toLowerCase().split("@")[0] ?? "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";