/**
 * Bridge to the Windows desktop shell's local Microsoft SQL Server database.
 *
 * In the packaged Electron app the preload script exposes `window.pos`, and
 * every write becomes a parameterised T-SQL statement executed in the main
 * process. In a plain browser the bridge is absent and callers fall back to the
 * localStorage outbox, so the web build behaves exactly as before.
 */
import type { SyncOp } from "./sync-outbox";

export type LocalDbConfig = {
  server: string;
  database: string;
  /** "windows" uses integrated auth, "sql" uses the user/password pair */
  auth: "windows" | "sql";
  user: string;
  password: string;
  port: number;
  encrypt: boolean;
};

export const defaultLocalDbConfig: LocalDbConfig = {
  server: "localhost\\SQLEXPRESS",
  database: "LovablePOS",
  auth: "windows",
  user: "",
  password: "",
  port: 1433,
  encrypt: false,
};

export type TableSyncStat = {
  table: string;
  pending: number;
  synced: number;
  errored: number;
};

export type LocalSyncStatus = {
  connected: boolean;
  error?: string;
  tables: TableSyncStat[];
  lastPushAt: string | null;
  lastPullAt: string | null;
};

export type PosBridge = {
  /** Persist one operation to local SQL Server. Resolves once committed. */
  write: (context: string, op: SyncOp) => Promise<{ ok: boolean; error?: string }>;
  connect: (config: LocalDbConfig) => Promise<{ ok: boolean; error?: string }>;
  test: (config: LocalDbConfig) => Promise<{ ok: boolean; error?: string; version?: string }>;
  status: () => Promise<LocalSyncStatus>;
  push: () => Promise<{ ok: boolean; pushed: number; failed: number; error?: string }>;
  pull: () => Promise<{ ok: boolean; merged: number; error?: string }>;
  setSyncEnabled: (on: boolean) => Promise<void>;
  backup: (path?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  retryErrored: () => Promise<{ ok: boolean }>;
  onStatus: (cb: (s: LocalSyncStatus) => void) => () => void;
};

declare global {
  interface Window {
    pos?: PosBridge;
  }
}

/** True when running inside the Windows desktop shell. */
export const hasLocalDb = (): boolean => typeof window !== "undefined" && !!window.pos;

export const localDb = (): PosBridge | null =>
  typeof window === "undefined" ? null : (window.pos ?? null);

const CONFIG_KEY = "pos.localdb.config";

export function readLocalDbConfig(): LocalDbConfig {
  if (typeof window === "undefined") return defaultLocalDbConfig;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw
      ? { ...defaultLocalDbConfig, ...(JSON.parse(raw) as Partial<LocalDbConfig>) }
      : defaultLocalDbConfig;
  } catch {
    return defaultLocalDbConfig;
  }
}

/** Credentials never leave the machine; the password is held by the shell. */
export function writeLocalDbConfig(config: LocalDbConfig) {
  if (typeof window === "undefined") return;
  const { password: _password, ...safe } = config;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(safe));
}