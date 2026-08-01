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
};

export const FULL_PERMISSIONS: StaffPermissions = {
  financials: true,
  products: true,
  ecommerce: true,
};

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  financials: false,
  products: false,
  ecommerce: false,
};

export const PERMISSION_LABELS: { key: keyof StaffPermissions; label: string }[] = [
  { key: "financials", label: "Can Access Financial History Reports" },
  { key: "products", label: "Can Create New Products / Access PO Engine" },
  { key: "ecommerce", label: "Can Toggle E-commerce Website Visibility" },
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
    permissions: { financials: true, products: true, ecommerce: false },
  },
  {
    id: "u2",
    name: "Maya Lin",
    staffId: "EMP-102",
    email: "",
    storeId: "s2",
    permissions: { financials: true, products: false, ecommerce: false },
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

type AuthCtx = {
  ready: boolean;
  user: PosUser | null;
  isAdmin: boolean;
  /** raw Supabase user id of the signed-in account */
  authUserId: string | null;
  /** permission check that always passes for the admin */
  can: (flag: keyof StaffPermissions) => boolean;
  staff: StaffMember[];
  addStaff: (member: Omit<StaffMember, "id">) => void;
  updateStaff: (member: StaffMember) => void;
  removeStaff: (id: string) => void;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

const norm = (v: string) => v.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(false);

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
  }, []);

  // Resolved fresh from the staff list so a duty change applies immediately.
  const user = useMemo<PosUser | null>(() => {
    const account = session?.user;
    if (!account) return null;
    const email = account.email ?? "";
    const isAdmin = roles.includes("admin");
    const found = email ? staff.find((s) => s.email && norm(s.email) === norm(email)) : undefined;
    const fallbackName =
      (account.user_metadata?.["full_name"] as string | undefined) || email.split("@")[0] || "User";
    return {
      staffId: found?.staffId ?? email,
      name: found?.name ?? fallbackName,
      email,
      role: isAdmin ? "admin" : "cashier",
      roles,
      storeId: isAdmin ? null : (found?.storeId ?? null),
      permissions: isAdmin
        ? FULL_PERMISSIONS
        : { ...DEFAULT_PERMISSIONS, ...(found?.permissions ?? {}) },
    };
  }, [session, roles, staff]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === "admin",
      authUserId: userId,
      can: (flag) => user?.role === "admin" || !!user?.permissions?.[flag],
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      signUp,
      logout,
    }),
    [ready, user, userId, staff, addStaff, updateStaff, removeStaff, login, signUp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
