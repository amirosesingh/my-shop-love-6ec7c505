import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { type MetaRole } from "@/lib/pos-users";
import { TERMINAL_TOKEN_KEY } from "@/lib/pos-caller-auth";
import { issueCashierSession } from "@/lib/pos-session.functions";
import { verifyCashierPin } from "@/lib/pos-cashiers";
import { cacheCredential, verifyCachedPin } from "@/lib/offline-credentials";
import { recordSignIn } from "@/lib/shift-attendance";
import { endShiftSessions } from "@/lib/shift-sessions";
import {
  CASHIER_PERMISSIONS,
  FULL_PERMISSIONS,
  NO_PERMISSIONS,
  WAREHOUSE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  fromDbRole,
  normalizePermissions,
  resolvePermission,
  toDbRole,
  type PermissionFlag,
  type PermissionKey,
  type StaffPermissions,
  type StaffRole,
} from "@/lib/permissions";

export {
  CASHIER_PERMISSIONS,
  FULL_PERMISSIONS,
  NO_PERMISSIONS,
  WAREHOUSE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  fromDbRole,
  normalizePermissions,
  toDbRole,
};
export type { PermissionFlag, PermissionKey, StaffPermissions, StaffRole };

export type PosRole = "cashier" | "admin";

/** Roles stored in the backend `user_roles` table. */
export type AppRole = "admin" | "manager" | "staff";
export const APP_ROLES: AppRole[] = ["admin", "manager", "staff"];

export const DEFAULT_PERMISSIONS = CASHIER_PERMISSIONS;

/** An employee record the admin can edit at any time. */
export type StaffMember = {
  id: string;
  name: string;
  /** unique staff id used to sign in */
  staffId: string;
  /** Supabase login email linking this duty record to a backend account */
  email: string;
  /** legacy local password (unused since Supabase auth) */
  password?: string;
  /** current assigned store duty */
  storeId: string;
  permissions: StaffPermissions;
};

export type PosUser = {
  staffId: string;
  name: string;
  email: string;
  role: PosRole;
  /** role stored on the Supabase account (user_metadata.role) */
  metaRole: MetaRole | null;
  /** backend roles granted to this account */
  roles: AppRole[];
  /** null for admin = access to every store */
  storeId: string | null;
  permissions: StaffPermissions;
};

const SEED_STAFF: StaffMember[] = [
  {
    id: "u1",
    name: "John Carter",
    staffId: "EMP-101",
    email: "",
    storeId: "s1",
    permissions: { ...DEFAULT_PERMISSIONS, can_view_sales_reports: true, can_add_new_product: true },
  },
  {
    id: "u2",
    name: "Maya Lin",
    staffId: "EMP-102",
    email: "",
    storeId: "s2",
    permissions: { ...DEFAULT_PERMISSIONS, can_view_sales_reports: true },
  },
  {
    id: "u3",
    name: "Sofia Reyes",
    staffId: "EMP-103",
    email: "",
    storeId: "s3",
    permissions: { ...DEFAULT_PERMISSIONS },
  },
];

const STAFF_KEY = "pos-staff-v1";
/** Terminal identity of the cashier at the till. Never stores the PIN. */
const TERMINAL_KEY = "pos-terminal-user-v1";

export type TerminalUser = {
  userCode: string;
  name: string;
  role: AppRole;
  storeId: string | null;
  email: string;
  /** row id in public.cashiers when this is a cashier terminal session */
  cashierId?: string;
  /** permission matrix loaded with the cashier row */
  permissions?: Partial<StaffPermissions>;
  /** signed in locally because the backend terminal tables are not provisioned yet */
  local?: boolean;
};

/** Row loaded from public.app_users for the signed-in account. */
export type AppUserProfile = {
  user_id: string;
  full_name: string;
  role: AppRole;
  store_id: string | null;
  email: string;
  permissions: Partial<StaffPermissions> | null;
  is_active: boolean;
};

/** Offline bootstrap admin so the terminal is never locked out before the
 *  backend auth tables (app_users / user_roles) have been provisioned. */

type AuthCtx = {
  ready: boolean;
  user: PosUser | null;
  isAdmin: boolean;
  /** supervisor or admin — may reach settings, reports, inventory, user management */
  isSupervisor: boolean;
  /** admin, or a supervisor assigned to "All stores" — may switch branches */
  canSwitchStores: boolean;
  /** cashier accounts are limited to the POS terminal */
  isCashier: boolean;
  /** warehouse account — stock/receiving user driven purely by its toggles */
  isWarehouse: boolean;
  /** raw Supabase user id of the signed-in account */
  authUserId: string | null;
  /** cashier currently signed in at the terminal (User ID + PIN) */
  terminalUser: TerminalUser | null;
  /** public.app_users record backing the signed-in account */
  appUser: AppUserProfile | null;
  /** permission check that always passes for the admin */
  can: (flag: PermissionFlag) => boolean;
  staff: StaffMember[];
  addStaff: (member: Omit<StaffMember, "id">) => void;
  updateStaff: (member: StaffMember) => void;
  removeStaff: (id: string) => void;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Cashier tab: numeric User ID + PIN mapped onto a Supabase email account. */
  cashierLogin: (userId: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  /** Lock the till / switch user — clears the session without losing local data. */
  lock: () => Promise<void>;
};

/**
 * The auth context is stored on a global registry key rather than as a plain
 * module constant. If the module ever gets evaluated twice (mixed `@/lib/...`
 * and relative import paths, or a stale dev cache), both copies then share one
 * context object instead of silently creating two — which is what produced the
 * "useAuth must be used inside AuthProvider" crash on pages like /settings.
 */
const AUTH_CTX_KEY = "__nwPosAuthContext__";
const AUTH_LOADS_KEY = "__nwPosAuthModuleLoads__";

type AuthGlobal = {
  [AUTH_CTX_KEY]?: Context<AuthCtx | null>;
  [AUTH_LOADS_KEY]?: number;
};

const authGlobal = globalThis as unknown as AuthGlobal;

const AuthContext: Context<AuthCtx | null> =
  authGlobal[AUTH_CTX_KEY] ?? createContext<AuthCtx | null>(null);
authGlobal[AUTH_CTX_KEY] = AuthContext;

authGlobal[AUTH_LOADS_KEY] = (authGlobal[AUTH_LOADS_KEY] ?? 0) + 1;
if (import.meta.env.DEV && (authGlobal[AUTH_LOADS_KEY] ?? 0) > 1) {
  console.warn(
    `[pos-auth] This auth module has been loaded ${authGlobal[AUTH_LOADS_KEY]} times. ` +
      "Duplicate instances usually mean the same file is imported through different " +
      'specifiers (e.g. "@/lib/pos-auth" in one file and "./pos-auth" in another), or a ' +
      "stale Vite cache after a rename.\n" +
      'Fix: import it as "@/lib/pos-auth" everywhere, then hard-reload the preview. ' +
      "The shared context registry keeps the app working meanwhile.",
  );
}

const norm = (v: string) => v.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(false);
  const [terminalUser, setTerminalUser] = useState<TerminalUser | null>(null);
  const [appUser, setAppUser] = useState<AppUserProfile | null>(null);

  useEffect(() => {
    try {
      const rawStaff = window.localStorage.getItem(STAFF_KEY);
      if (rawStaff)
        setStaff(
          (JSON.parse(rawStaff) as StaffMember[]).map((s) => ({
            ...s,
            email: s.email ?? "",
            permissions: { ...DEFAULT_PERMISSIONS, ...(s.permissions ?? {}) },
          })),
        );
    } catch {
      /* ignore corrupt storage */
    }
    try {
      const rawTerminal = window.sessionStorage.getItem(TERMINAL_KEY);
      if (rawTerminal) setTerminalUser(JSON.parse(rawTerminal) as TerminalUser);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Supabase session: hydrate once, then follow auth state changes.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setRoles([]);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Backend roles for the signed-in account.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setRoles([]);
      return;
    }
    void supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (!cancelled) setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Identity + permission toggles from public.app_users for the signed-in account.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setAppUser(null);
      return;
    }
    void supabase.rpc("current_app_user" as never).then(({ data }) => {
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as unknown as
        | AppUserProfile
        | undefined;
      setAppUser(row ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback((next: StaffMember[]) => {
    setStaff(next);
    try {
      window.localStorage.setItem(STAFF_KEY, JSON.stringify(next));
    } catch {
      /* storage full */
    }
  }, []);

  const addStaff = useCallback(
    (member: Omit<StaffMember, "id">) =>
      persist([...staff, { ...member, id: crypto.randomUUID() }]),
    [persist, staff],
  );

  const updateStaff = useCallback(
    (member: StaffMember) => persist(staff.map((s) => (s.id === member.id ? member : s))),
    [persist, staff],
  );

  const removeStaff = useCallback(
    (id: string) => persist(staff.filter((s) => s.id !== id)),
    [persist, staff],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [],
  );

  const cashierLogin = useCallback(async (userId: string, pin: string) => {
    const code = userId.trim().toLowerCase();
    if (!code) return { ok: false, error: "Enter your username" };
    if (!/^\d{6}$/.test(pin)) return { ok: false, error: "Enter your 6-digit PIN" };
    let row: Awaited<ReturnType<typeof verifyCashierPin>> = null;
    let offline = false;
    try {
      row = await verifyCashierPin(code, pin);
    } catch {
      offline = true;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) offline = true;

    let next: TerminalUser;
    if (row) {
      next = {
        userCode: row.username,
        name: row.full_name || row.username,
        role: "staff",
        storeId: row.store_id,
        email: "",
        cashierId: row.id,
        permissions: row.permissions,
      };
      // Remember this employee so the till still opens with no connection.
      void cacheCredential(pin, {
        username: row.username,
        cashierId: row.id,
        fullName: row.full_name || row.username,
        storeId: row.store_id ?? "",
        permissions: row.permissions as unknown as Record<string, boolean>,
      });
    } else if (offline) {
      const cached = await verifyCachedPin(code, pin);
      if (!cached)
        return {
          ok: false,
          error:
            "No connection and this account has not signed in on this terminal before. Connect to the internet once, then you can sign in offline.",
        };
      next = {
        userCode: cached.username,
        name: cached.fullName,
        role: "staff",
        storeId: cached.storeId,
        email: "",
        cashierId: cached.cashierId,
        permissions: cached.permissions as unknown as TerminalUser["permissions"],
      };
    } else {
      return { ok: false, error: "Invalid username or PIN" };
    }
    setTerminalUser(next);
    try {
      window.sessionStorage.setItem(TERMINAL_KEY, JSON.stringify(next));
    } catch {
      /* session storage unavailable */
    }
    // Signed terminal session so privileged server functions can verify the
    // cashier — the PIN is re-checked server-side when minting it.
    try {
      const issued = await issueCashierSession({ data: { username: code, pin } });
      if (issued.ok) window.sessionStorage.setItem(TERMINAL_TOKEN_KEY, issued.token);
    } catch {
      /* messaging features stay locked without a terminal token */
    }
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: { full_name: fullName.trim() },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, needsConfirmation: !data.session };
  }, []);

  const logout = useCallback(async () => {
    // Stamp the sign-out time on this user's open shift sessions first.
    endShiftSessions({});
    await supabase.auth.signOut();
    setSession(null);
    setRoles([]);
    setTerminalUser(null);
    try {
      window.sessionStorage.removeItem(TERMINAL_KEY);
      window.sessionStorage.removeItem(TERMINAL_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolved fresh from the staff list so a duty change applies immediately.
  const user = useMemo<PosUser | null>(() => {
    const account = session?.user;
    if (!account) {
      if (!terminalUser) return null;
      // Local bootstrap / offline terminal session.
      const isLocalAdmin = terminalUser.role === "admin" || terminalUser.role === "manager";
      return {
        staffId: terminalUser.userCode,
        name: terminalUser.name,
        email: terminalUser.email,
        role: isLocalAdmin ? "admin" : "cashier",
        metaRole:
          terminalUser.role === "admin"
            ? "admin"
            : terminalUser.role === "manager"
              ? "supervisor"
              : "cashier",
        roles: [terminalUser.role],
        storeId: terminalUser.role === "admin" ? null : terminalUser.storeId,
        permissions: isLocalAdmin
          ? FULL_PERMISSIONS
          : normalizePermissions(terminalUser.permissions ?? {}, "cashier"),
      };
    }
    const email = account.email ?? "";
    const meta = account.user_metadata ?? {};
    const metaRole = (meta["role"] as MetaRole | undefined) ?? null;
    const isTrueAdmin =
      metaRole === "admin" ||
      roles.includes("admin") ||
      appUser?.role === "admin" ||
      terminalUser?.role === "admin";
    // Supervisors reach the same management screens as admins, but their
    // store scope is their own assignment (null = all stores).
    const isElevated =
      isTrueAdmin ||
      metaRole === "supervisor" ||
      roles.includes("manager") ||
      appUser?.role === "manager" ||
      terminalUser?.role === "manager";
    const isAdmin = isElevated;
    const found = email ? staff.find((s) => s.email && norm(s.email) === norm(email)) : undefined;
    const fallbackName =
      (meta["full_name"] as string | undefined) || email.split("@")[0] || "User";
    return {
      staffId:
        appUser?.user_id ??
        (meta["user_id"] as string | undefined) ??
        terminalUser?.userCode ??
        found?.staffId ??
        email,
      name: appUser?.full_name ?? terminalUser?.name ?? found?.name ?? fallbackName,
      email,
      role: isAdmin ? "admin" : "cashier",
      metaRole,
      roles,
      storeId: isTrueAdmin
        ? null
        : isElevated
          ? (appUser?.store_id ?? (meta["store_id"] as string | null | undefined) ?? null)
          : (appUser?.store_id ??
          (meta["store_id"] as string | null | undefined) ??
          terminalUser?.storeId ??
          found?.storeId ??
          null),
      permissions: isAdmin
        ? { ...FULL_PERMISSIONS }
        : // public.app_users is the source of truth when the account has a row.
          normalizePermissions(
            Object.keys({
              ...(found?.permissions ?? {}),
              ...(appUser?.permissions ?? {}),
            }).length
              ? { ...(found?.permissions ?? {}), ...(appUser?.permissions ?? {}) }
              : null,
            fromDbRole(appUser?.role ?? null),
          ),
    };
  }, [session, roles, staff, terminalUser, appUser]);

  // Local, per-terminal record of who signed in today. Lets a shift opened by
  // one cashier be continued by another while still showing every user.
  useEffect(() => {
    if (!user) return;
    recordSignIn({
      staffId: user.staffId,
      name: user.name,
      role: user.metaRole ?? user.role,
    });
  }, [user?.staffId, user?.name, user?.role, user?.metaRole]);

  const isWarehouse =
    !!session?.user &&
    !terminalUser?.cashierId &&
    user?.role !== "admin" &&
    (appUser?.role === "staff" ||
      (session.user.user_metadata?.["role"] as string | undefined) === "warehouse");

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === "admin",
      isSupervisor: user?.metaRole === "supervisor" || user?.role === "admin",
      // Admins, "All stores" supervisors and all-store warehouse accounts.
      canSwitchStores: !!user && !user.storeId && (user.role === "admin" || isWarehouse),
      isCashier:
        !isWarehouse && (user?.metaRole === "cashier" || (!!user && user.role !== "admin")),
      isWarehouse,
      authUserId: userId,
      terminalUser,
      appUser,
      can: (flag) =>
        user?.role === "admin" || !!user?.permissions?.[resolvePermission(flag)],
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      cashierLogin,
      signUp,
      logout,
      lock: logout,
    }),
    [
      ready,
      user,
      userId,
      terminalUser,
      appUser,
      isWarehouse,
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      cashierLogin,
      signUp,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Non-throwing variant for providers that must degrade instead of crash. */
export function useAuthOptional(): AuthCtx | null {
  return useContext(AuthContext);
}
