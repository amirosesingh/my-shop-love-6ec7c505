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

export type PosUser = {
  username: string;
  name: string;
  role: PosRole;
  /** null for admin = access to every store */
  storeId: string | null;
};

type Account = PosUser & { password: string };

/** Mock accounts — local demo only, no backend. */
const ACCOUNTS: Account[] = [
  {
    username: "cashier1",
    password: "123",
    name: "Cashier One",
    role: "cashier",
    storeId: "s1",
  },
  {
    username: "cashier2",
    password: "123",
    name: "Cashier Two",
    role: "cashier",
    storeId: "s2",
  },
  {
    username: "admin",
    password: "123",
    name: "Store Admin",
    role: "admin",
    storeId: null,
  },
];

const KEY = "pos-session-v1";

type AuthCtx = {
  ready: boolean;
  user: PosUser | null;
  isAdmin: boolean;
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PosUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PosUser;
        const found = ACCOUNTS.find((a) => a.username === saved.username);
        if (found) {
          const { password: _pw, ...safe } = found;
          setUser(safe);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  const login = useCallback((username: string, password: string) => {
    const found = ACCOUNTS.find(
      (a) => a.username === username.trim().toLowerCase() && a.password === password,
    );
    if (!found) return { ok: false, error: "Invalid username or password" };
    const { password: _pw, ...safe } = found;
    setUser(safe);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(safe));
    } catch {
      /* storage full */
    }
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ ready, user, isAdmin: user?.role === "admin", login, logout }),
    [ready, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
