import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { cashierEmail, cashierSecret, type MetaRole } from "@/lib/pos-users";

export type PosRole = "cashier" | "admin";

/** Roles stored in the backend `user_roles` table. */
export type AppRole = "admin" | "manager" | "staff";
export const APP_ROLES: AppRole[] = ["admin", "manager", "staff"];

/** Feature flags the admin can toggle per employee. */
export type StaffPermissions = {
  /** Can Access Financial History Reports */
  financials: boolean;
  /** Can Create New Products / Access PO Engine */
  products: boolean;
  /** Can Toggle E-commerce Website Visibility */
  ecommerce: boolean;
  /** Can apply line / bill discounts at the register */
  can_give_discount: boolean;
  /** Can complete refunds and exchanges that pay money back */
  can_refund: boolean;
  /** Can pop the cash drawer outside of a sale */
  can_open_drawer_manual: boolean;
};

export const FULL_PERMISSIONS: StaffPermissions = {
  financials: true,
  products: true,
  ecommerce: true,
  can_give_discount: true,
  can_refund: true,
  can_open_drawer_manual: true,
};

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  financials: false,
  products: false,
  ecommerce: false,
  can_give_discount: false,
  can_refund: false,
  can_open_drawer_manual: false,
};

export const PERMISSION_LABELS: { key: keyof StaffPermissions; label: string }[] = [
  { key: "financials", label: "Can Access Financial History Reports" },
  { key: "products", label: "Can Create New Products / Access PO Engine" },
  { key: "ecommerce", label: "Can Toggle E-commerce Website Visibility" },
  { key: "can_give_discount", label: "Can Give Discounts" },
  { key: "can_refund", label: "Can Process Refunds / Exchanges" },
  { key: "can_open_drawer_manual", label: "Can Open Cash Drawer Manually" },
];

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
    permissions: { ...DEFAULT_PERMISSIONS, financials: true, products: true },
  },
  {
    id: "u2",
    name: "Maya Lin",
    staffId: "EMP-102",
    email: "",
    storeId: "s2",
    permissions: { ...DEFAULT_PERMISSIONS, financials: true },
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
  /** signed in locally because the backend terminal tables are not provisioned yet */
  local?: boolean;
};

/** Row loaded from public.app_users for the signed-in account. */
export type AppUserProfile = {
  user_code: string;
  full_name: string;
  role: AppRole;
  store_id: string | null;
  email: string;
  permissions: Partial<StaffPermissions> | null;
  is_active: boolean;
};

/** Offline bootstrap admin so the terminal is never locked out before the
 *  backend auth tables (app_users / user_roles) have been provisioned. */
const BOOTSTRAP_ADMIN_CODE = "admin";
const BOOTSTRAP_PIN_KEY = "pos-bootstrap-admin-pin";
const DEFAULT_BOOTSTRAP_PIN = "1234";

type AuthCtx = {
  ready: boolean;
  user: PosUser | null;
  isAdmin: boolean;
  /** supervisor or admin — may reach settings, reports, inventory, user management */
  isSupervisor: boolean;
  /** cashier accounts are limited to the POS terminal */
  isCashier: boolean;
  /** raw Supabase user id of the signed-in account */
  authUserId: string | null;
  /** cashier currently signed in at the terminal (User ID + PIN) */
  terminalUser: TerminalUser | null;
  /** public.app_users record backing the signed-in account */
  appUser: AppUserProfile | null;
  /** permission check that always passes for the admin */
  can: (flag: keyof StaffPermissions) => boolean;
  staff: StaffMember[];
  addStaff: (member: Omit<StaffMember, "id">) => void;
  updateStaff: (member: StaffMember) => void;
  removeStaff: (id: string) => void;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Cashier tab: numeric User ID + PIN mapped onto a Supabase email account. */
  cashierLogin: (userId: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  /** User ID + 4-digit PIN sign-in; the PIN is verified inside the database. */
  pinLogin: (userCode: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  /** Lock the till / switch user — clears the session without losing local data. */
  lock: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

const norm = (v: string) => v.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(false);
  const [terminalUser, setTerminalUser] = useState<TerminalUser | null>(null);

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
    const code = userId.trim();
    if (!code) return { ok: false, error: "Enter your User ID" };
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: "Enter your 4-digit PIN" };
    const { error } = await supabase.auth.signInWithPassword({
      email: cashierEmail(code),
      password: cashierSecret(code, pin),
    });
    return error ? { ok: false, error: "Invalid User ID or PIN" } : { ok: true };
  }, []);

  const pinLogin = useCallback(async (userCode: string, pin: string) => {
    const code = userCode.trim();
    if (!code) return { ok: false, error: "Enter your User ID" };
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: "Enter your 4-digit PIN" };

    const signInLocalAdmin = () => {
      let expected = DEFAULT_BOOTSTRAP_PIN;
      try {
        expected = window.localStorage.getItem(BOOTSTRAP_PIN_KEY) || DEFAULT_BOOTSTRAP_PIN;
      } catch {
        /* storage unavailable */
      }
      if (norm(code) !== BOOTSTRAP_ADMIN_CODE || pin !== expected) return false;
      const next: TerminalUser = {
        userCode: "admin",
        name: "Administrator",
        role: "admin",
        storeId: null,
        email: "",
        local: true,
      };
      setTerminalUser(next);
      try {
        window.sessionStorage.setItem(TERMINAL_KEY, JSON.stringify(next));
      } catch {
        /* session storage unavailable */
      }
      return true;
    };

    // The PIN is compared against the bcrypt digest inside the database;
    // it is never stored, logged or persisted on this device.
    const { data, error } = await supabase.rpc("verify_terminal_pin" as never, {
      p_user_code: code,
      p_pin: pin,
    } as never);
    if (error) {
      if (signInLocalAdmin()) return { ok: true };
      return {
        ok: false,
        error:
          "Terminal accounts are not set up in the backend yet. Sign in with the admin User ID “admin” and PIN 1234, or run the setup SQL.",
      };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          user_code: string;
          full_name: string;
          role: AppRole;
          store_id: string | null;
          email: string;
          auth_secret: string;
        }
      | undefined;
    if (!row) {
      if (signInLocalAdmin()) return { ok: true };
      return { ok: false, error: "Invalid User ID or PIN" };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: row.email,
      password: row.auth_secret,
    });
    if (signInError) return { ok: false, error: signInError.message };

    const next: TerminalUser = {
      userCode: row.user_code,
      name: row.full_name,
      role: row.role,
      storeId: row.store_id,
      email: row.email,
    };
    setTerminalUser(next);
    try {
      window.sessionStorage.setItem(TERMINAL_KEY, JSON.stringify(next));
    } catch {
      /* session storage unavailable */
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
    await supabase.auth.signOut();
    setSession(null);
    setRoles([]);
    setTerminalUser(null);
    try {
      window.sessionStorage.removeItem(TERMINAL_KEY);
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
      const isLocalAdmin = terminalUser.role === "admin";
      return {
        staffId: terminalUser.userCode,
        name: terminalUser.name,
        email: terminalUser.email,
        role: isLocalAdmin ? "admin" : "cashier",
        metaRole: isLocalAdmin ? "admin" : "cashier",
        roles: [terminalUser.role],
        storeId: isLocalAdmin ? null : terminalUser.storeId,
        permissions: isLocalAdmin ? FULL_PERMISSIONS : { ...DEFAULT_PERMISSIONS },
      };
    }
    const email = account.email ?? "";
    const meta = account.user_metadata ?? {};
    const metaRole = (meta["role"] as MetaRole | undefined) ?? null;
    const isAdmin =
      metaRole === "admin" ||
      metaRole === "supervisor" ||
      roles.includes("admin") ||
      terminalUser?.role === "admin";
    const found = email ? staff.find((s) => s.email && norm(s.email) === norm(email)) : undefined;
    const fallbackName =
      (meta["full_name"] as string | undefined) || email.split("@")[0] || "User";
    return {
      staffId:
        (meta["user_id"] as string | undefined) ?? terminalUser?.userCode ?? found?.staffId ?? email,
      name: terminalUser?.name ?? found?.name ?? fallbackName,
      email,
      role: isAdmin ? "admin" : "cashier",
      metaRole,
      roles,
      storeId: isAdmin
        ? null
        : ((meta["store_id"] as string | null | undefined) ??
          terminalUser?.storeId ??
          found?.storeId ??
          null),
      permissions: isAdmin
        ? FULL_PERMISSIONS
        : { ...DEFAULT_PERMISSIONS, ...(found?.permissions ?? {}) },
    };
  }, [session, roles, staff, terminalUser]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === "admin",
      isSupervisor: user?.metaRole === "supervisor" || user?.role === "admin",
      isCashier: user?.metaRole === "cashier" || (!!user && user.role !== "admin"),
      authUserId: userId,
      terminalUser,
      can: (flag) => user?.role === "admin" || !!user?.permissions?.[flag],
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      cashierLogin,
      pinLogin,
      signUp,
      logout,
      lock: logout,
    }),
    [
      ready,
      user,
      userId,
      terminalUser,
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      cashierLogin,
      pinLogin,
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
