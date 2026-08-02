/**
 * Lightweight per-day sign-in log for a terminal.
 *
 * Purely local (localStorage): it records who signed in on this PC today so a
 * shift opened by one cashier can be continued by another and still show every
 * person who used the till during the day. This is NOT an HR attendance system
 * — it only tracks sign-in visibility.
 */

const KEY = "pos-signin-log-v1";

export type SignInEntry = {
  staffId: string;
  name: string;
  role: string;
  firstSeen: string;
  lastSeen: string;
};

type Store = Record<string, SignInEntry[]>;

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    // Keep the last 14 days only.
    const keys = Object.keys(store).sort().slice(-14);
    const trimmed: Store = {};
    for (const k of keys) trimmed[k] = store[k]!;
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full / disabled — sign-in visibility is best effort */
  }
}

/** Record (or refresh) a sign-in for today. Safe to call repeatedly. */
export function recordSignIn(u: { staffId: string; name: string; role?: string | null }) {
  if (!u.staffId && !u.name) return;
  const key = dayKey();
  const store = read();
  const list = store[key] ? [...store[key]!] : [];
  const id = u.staffId || u.name;
  const now = new Date().toISOString();
  const idx = list.findIndex((e) => e.staffId === id);
  if (idx >= 0) {
    const prev = list[idx]!;
    // Only bump lastSeen when meaningfully newer, to avoid write storms.
    if (Date.now() - Date.parse(prev.lastSeen) < 60_000 && prev.name === u.name) return;
    list[idx] = { ...prev, name: u.name || prev.name, role: u.role || prev.role, lastSeen: now };
  } else {
    list.push({
      staffId: id,
      name: u.name || id,
      role: u.role || "staff",
      firstSeen: now,
      lastSeen: now,
    });
  }
  store[key] = list;
  write(store);
}

/** Everyone who signed in on this terminal for the given day (default: today). */
export function signInsForDay(key: string = dayKey()): SignInEntry[] {
  const list = read()[key] ?? [];
  return [...list].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
}

export function clearSignInLog() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
