/**
 * Staff provisioning with the server's own key.
 *
 * Every operator — admin, supervisor, warehouse, cashier or any custom role —
 * gets one real account. Cashiers never see an email address: their username
 * is turned into a hidden internal address and their PIN is the password, so
 * the till holds a normal verified session instead of a home-made token.
 */
import { supabaseConfig } from "./external-supabase-config";
import { serviceRest, serviceKey } from "./pos-relay.server";

export const INTERNAL_EMAIL_DOMAIN = "pos-internal.local";

export const internalEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${INTERNAL_EMAIL_DOMAIN}`;

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

/** Call a database routine with the service key. */
export async function serviceRpc(name: string, body: Record<string, unknown>) {
  const res = await serviceRest(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || "The database refused this");
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

/** The caller must be a supervisor or admin — checked against their own session. */
export async function requireSupervisor(accessToken: string): Promise<void> {
  if (!accessToken) throw new Error("Please sign in again");
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/is_app_supervisor`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) throw new Error("Please sign in again");
  if ((await res.json()) !== true) {
    throw new Error("Only supervisors and admins can manage staff");
  }
}

/** Find an existing auth account for this address. */
async function findUserId(email: string): Promise<string | null> {
  const res = await adminFetch(
    `admin/users?page=1&per_page=1&email=${encodeURIComponent(email)}`,
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

export type StaffPayload = {
  displayName: string;
  /** what the admin typed: a plain username, or a real email address */
  username: string;
  /** 4-6 digits — required for username (terminal) accounts */
  pin?: string;
  /** password — required for real-email accounts */
  password?: string;
  branchId?: string | null;
  roleSlug: string;
  baseRole: "admin" | "manager" | "staff";
  active: boolean;
};

/** A real address is anything with an "@" that is not our own hidden domain. */
export const isRealEmail = (input: string) => {
  const v = input.trim().toLowerCase();
  return v.includes("@") && !v.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
};

/**
 * Create (or repair) the account behind a staff member and mirror the profile
 * into public.app_users.
 *
 * A plain username becomes a hidden internal address, is confirmed on the spot
 * and uses the PIN as its password, so the till can sign in immediately.
 * A real email address is kept as typed, uses its own password, and is left
 * unconfirmed so the person receives the usual verification email.
 */
export async function provisionStaffAccount(payload: StaffPayload): Promise<{ userId: string }> {
  const typed = payload.username.trim().toLowerCase();
  if (!typed) throw new Error("Enter a username or an email address");
  if (!payload.roleSlug?.trim()) throw new Error("Choose a role for this person");
  const emailMode = isRealEmail(typed);
  const pin = (payload.pin ?? "").trim();
  const password = payload.password ?? "";

  let username: string;
  let email: string;
  let secret: string;
  if (emailMode) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed)) throw new Error("That email address is not valid");
    if (password.length < 8) throw new Error("A password must be at least 8 characters");
    email = typed;
    secret = password;
    username = (typed.split("@")[0] ?? "").replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "user";
  } else {
    username = typed;
    if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
      throw new Error("A username may only use letters, numbers, dot, dash or underscore");
    }
    if (!/^\d{4,6}$/.test(pin)) throw new Error("A PIN must be 4 to 6 digits");
    email = internalEmail(username);
    secret = pin;
  }

  const metadata = {
    username,
    full_name: payload.displayName.trim() || username,
    role: payload.baseRole === "admin" ? "admin" : payload.baseRole === "manager" ? "supervisor" : "cashier",
    role_slug: payload.roleSlug,
    store_id: payload.branchId ?? null,
    active: payload.active,
  };

  const created = await adminFetch("admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: secret,
      email_confirm: !emailMode,
      user_metadata: metadata,
    }),
  });

  let userId: string | null = null;
  if (created.ok) {
    userId = ((await created.json()) as { id?: string }).id ?? null;
  } else {
    userId = await findUserId(email);
    if (!userId) {
      throw new Error((await created.text()).slice(0, 200) || "Could not create this account");
    }
    await adminFetch(`admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({
        password: secret,
        ...(emailMode ? {} : { email_confirm: true }),
        user_metadata: metadata,
      }),
    });
  }

  await serviceRpc("staff_account_upsert", {
    p_user_id: username,
    p_full_name: payload.displayName.trim() || username,
    p_email: email,
    p_role: payload.baseRole,
    p_role_slug: payload.roleSlug,
    p_store_id: payload.branchId ?? null,
    p_is_active: payload.active,
    p_pin: emailMode ? "" : pin,
    p_pin_length: emailMode ? 0 : pin.length,
    p_auth_user_id: userId,
    p_permissions: null,
  });

  await serviceRest("user_roles?on_conflict=user_id,role", {
    method: "POST",
    prefer: "return=minimal,resolution=merge-duplicates",
    body: JSON.stringify([{ user_id: userId, role: payload.baseRole }]),
  });

  return { userId: userId! };
}

/** Turn an account on or off everywhere at once. */
export async function setStaffActive(username: string, active: boolean): Promise<void> {
  const email = internalEmail(username);
  const userId = await findUserId(email);
  if (userId) {
    await adminFetch(`admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ user_metadata: { active } }),
    });
  }
  await serviceRpc("staff_account_set_active", {
    p_user_id: username.trim().toLowerCase(),
    p_active: active,
  });
}

type VerifiedPin = { username: string; fullName: string; storeId: string | null };

/** Check a PIN against whichever record holds it: the account, or the old cashier row. */
async function verifyPin(username: string, pin: string): Promise<VerifiedPin | null> {
  const account = (await serviceRpc("verify_terminal_pin", {
    p_user_id: username,
    p_pin: pin,
  })) as { user_id?: string; full_name?: string; store_id?: string | null }[] | null;
  const row = Array.isArray(account) ? account[0] : null;
  if (row?.user_id) {
    return {
      username: String(row.user_id),
      fullName: String(row.full_name ?? row.user_id),
      storeId: row.store_id ?? null,
    };
  }
  try {
    const legacy = (await serviceRpc("verify_cashier_pin", {
      p_username: username,
      p_pin: pin,
    })) as { username?: string; full_name?: string; store_id?: string | null }[] | null;
    const c = Array.isArray(legacy) ? legacy[0] : null;
    if (c?.username) {
      await serviceRpc("staff_account_adopt_legacy", { p_username: c.username });
      return {
        username: String(c.username),
        fullName: String(c.full_name ?? c.username),
        storeId: c.store_id ?? null,
      };
    }
  } catch {
    /* older databases have no cashier table */
  }
  return null;
}

/**
 * Silent healing path. The PIN is checked against the stored hash; when it
 * matches, the real account is created (or its password re-aligned) so the
 * next sign-in is an ordinary one. Returns the address to sign in with.
 */
export async function ensurePinAccount(
  username: string,
  pin: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const code = username.trim().toLowerCase();
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "Enter your PIN" };
  const verified = await verifyPin(code, pin);
  if (!verified) return { ok: false, error: "Invalid username or PIN" };

  const email = internalEmail(verified.username);
  const existing = await findUserId(email);
  if (existing) {
    await adminFetch(`admin/users/${existing}`, {
      method: "PUT",
      body: JSON.stringify({ password: pin, email_confirm: true }),
    });
    await serviceRpc("staff_account_upsert", {
      p_user_id: verified.username,
      p_full_name: verified.fullName,
      p_email: email,
      p_role: "staff",
      p_role_slug: null,
      p_store_id: verified.storeId,
      p_is_active: true,
      p_pin: "",
      p_pin_length: pin.length,
      p_auth_user_id: existing,
      p_permissions: null,
    });
    return { ok: true, email };
  }

  await provisionStaffAccount({
    displayName: verified.fullName,
    username: verified.username,
    pin,
    branchId: verified.storeId,
    roleSlug: "cashier",
    baseRole: "staff",
    active: true,
  });
  return { ok: true, email };
}

/** Bulk catch-up: copy every remaining cashier row across. */
export async function migrateLegacyCashiers(): Promise<{ migrated: number }> {
  const rows = (await serviceRpc("legacy_cashiers_for_migration", {})) as
    | { username?: string }[]
    | null;
  let migrated = 0;
  for (const row of rows ?? []) {
    if (!row.username) continue;
    await serviceRpc("staff_account_adopt_legacy", { p_username: row.username });
    migrated += 1;
  }
  return { migrated };
}

/** Active staff this till may offer on its sign-in grid. */
export async function listTerminalStaff(storeId: string | null) {
  const rows = (await serviceRpc("terminal_staff_list", { p_store_id: storeId })) as
    | Record<string, unknown>[]
    | null;
  return (rows ?? []).map((r) => ({
    username: String(r["user_id"] ?? ""),
    fullName: String(r["full_name"] ?? r["user_id"] ?? ""),
    roleSlug: String(r["role_slug"] ?? "cashier"),
    storeId: (r["store_id"] as string | null) ?? null,
    pinLength: Number(r["pin_length"] ?? 6) || 6,
  }));
}
