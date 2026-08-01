// Account provisioning helpers. All accounts (cashiers, supervisors, admins)
// live in Supabase Authentication; the role is stored in user_metadata.role.
import { createClient } from "@supabase/supabase-js";

export type MetaRole = "cashier" | "supervisor" | "admin";

/** Internal email domain used to turn a numeric cashier User ID into a login. */
export const CASHIER_EMAIL_DOMAIN = "store.internal";

export const cashierEmail = (userId: string) =>
  `${userId.trim().toLowerCase()}@${CASHIER_EMAIL_DOMAIN}`;

/**
 * Supabase enforces a 6-character minimum password, so the 4-digit PIN is
 * expanded into a deterministic secret. The plain PIN is never persisted.
 */
export const cashierSecret = (userId: string, pin: string) =>
  `pos-${userId.trim().toLowerCase()}-${pin}`;

const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_EXTERNAL_URL"] as string | undefined) ??
  "https://qhrufhtbeguxydenzfey.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_QwVvttLzDle_xTwP3L7Dyg_A6XM-cC-";

const signupFetch: typeof fetch = (input, init) => {
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
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsConfirmation: !data.session };
}

export function createCashierAccount(opts: {
  userId: string;
  fullName: string;
  pin: string;
  storeId?: string | null;
}) {
  return createAccount(cashierEmail(opts.userId), cashierSecret(opts.userId, opts.pin), {
    role: "cashier" satisfies MetaRole,
    user_id: opts.userId.trim(),
    full_name: opts.fullName.trim(),
    store_id: opts.storeId ?? null,
  });
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