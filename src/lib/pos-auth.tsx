import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PosRole = "cashier" | "admin";

/** An employee record the admin can edit at any time. */
export type StaffMember = {
  id: string;
  name: string;
  /** unique staff id used to sign in */
  staffId: string;
  password: string;
  /** current assigned store duty */
  storeId: string;
};

export type PosUser = {
  staffId: string;
  name: string;
  role: PosRole;
  /** null for admin = access to every store */
  storeId: string | null;
};

const ADMIN = { staffId: "admin", password: "123", name: "Store Admin" };

const SEED_STAFF: StaffMember[] = [
  { id: "u1", name: "John Carter", staffId: "EMP-101", password: "123", storeId: "s1" },
  { id: "u2", name: "Maya Lin", staffId: "EMP-102", password: "123", storeId: "s2" },
  { id: "u3", name: "Sofia Reyes", staffId: "EMP-103", password: "123", storeId: "s3" },
];

const STAFF_KEY = "pos-staff-v1";
const SESSION_KEY = "pos-session-v2";

type AuthCtx = {
  ready: boolean;
  user: PosUser | null;
  isAdmin: boolean;
  staff: StaffMember[];
  addStaff: (member: Omit<StaffMember, "id">) => void;
  updateStaff: (member: StaffMember) => void;
  removeStaff: (id: string) => void;
  login: (staffId: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

const norm = (v: string) => v.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffMember[]>(SEED_STAFF);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const rawStaff = window.localStorage.getItem(STAFF_KEY);
      if (rawStaff) setStaff(JSON.parse(rawStaff) as StaffMember[]);
      const rawSession = window.localStorage.getItem(SESSION_KEY);
      if (rawSession) setSessionId(rawSession);
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

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
    (staffId: string, password: string) => {
      const id = norm(staffId);
      if (id === ADMIN.staffId && password === ADMIN.password) {
        setSessionId(ADMIN.staffId);
        try {
          window.localStorage.setItem(SESSION_KEY, ADMIN.staffId);
        } catch {
          /* ignore */
        }
        return { ok: true };
      }
      const found = staff.find((s) => norm(s.staffId) === id && s.password === password);
      if (!found) return { ok: false, error: "Invalid staff ID or password" };
      setSessionId(found.staffId);
      try {
        window.localStorage.setItem(SESSION_KEY, found.staffId);
      } catch {
        /* ignore */
      }
      return { ok: true };
    },
    [staff],
  );

  const logout = useCallback(() => {
    setSessionId(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolved fresh from the staff list so a duty change applies immediately.
  const user = useMemo<PosUser | null>(() => {
    if (!sessionId) return null;
    if (norm(sessionId) === ADMIN.staffId)
      return { staffId: ADMIN.staffId, name: ADMIN.name, role: "admin", storeId: null };
    const found = staff.find((s) => norm(s.staffId) === norm(sessionId));
    if (!found) return null;
    return { staffId: found.staffId, name: found.name, role: "cashier", storeId: found.storeId };
  }, [sessionId, staff]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === "admin",
      staff,
      addStaff,
      updateStaff,
      removeStaff,
      login,
      logout,
    }),
    [ready, user, staff, addStaff, updateStaff, removeStaff, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
