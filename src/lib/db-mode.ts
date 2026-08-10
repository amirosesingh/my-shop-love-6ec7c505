/**
 * Where this till reads and writes: the online database, or the local one.
 *
 * "Online only" sends every change straight to the central database. "Local
 * first" stores it on this machine (local SQL Server on Windows, the on-disk
 * queue in a browser) and pushes it up in the background.
 *
 * If the chosen mode is online and the connection drops, the app fails over to
 * local on its own. The stored preference is never changed by a failover, so
 * the till returns to online working the moment the internet is back.
 */
import { isLiveOnly } from "./live-mode";

export type DatabaseMode = "online" | "local";

const KEY = "pos.db.mode";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Set while an online-mode write could not reach the central database. */
let failingOver = false;

const isBrowser = () => typeof window !== "undefined";

const notify = () => {
  for (const l of listeners) l();
};

export function subscribeDatabaseMode(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The default for this platform: the phone is a live client, tills are local-first. */
export const defaultDatabaseMode = (): DatabaseMode => (isLiveOnly() ? "online" : "local");

/** The mode the operator picked (ignoring any temporary failover). */
export function preferredDatabaseMode(): DatabaseMode {
  if (!isBrowser()) return defaultDatabaseMode();
  const raw = window.localStorage.getItem(KEY);
  return raw === "online" || raw === "local" ? raw : defaultDatabaseMode();
}

export function setPreferredDatabaseMode(mode: DatabaseMode) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, mode);
  if (mode === "local") failingOver = false;
  notify();
}

/** True when the phone build pins the mode and the switch cannot be used. */
export const databaseModeLocked = (): boolean => isLiveOnly();

/** Has the app dropped to local working because the connection failed? */
export const isFailingOver = (): boolean => failingOver;

/** Called when an online write could not reach the central database. */
export function noteConnectionLost() {
  if (failingOver) return;
  failingOver = true;
  notify();
}

/** Called when the connection is back so online working resumes. */
export function noteConnectionRestored() {
  if (!failingOver) return;
  failingOver = false;
  notify();
}

const online = () => !isBrowser() || window.navigator.onLine;

/**
 * Where writes should actually go right now — the chosen mode, unless the
 * connection is down, in which case local keeps the till trading.
 */
export function effectiveDatabaseMode(): DatabaseMode {
  if (isLiveOnly()) return "online";
  if (preferredDatabaseMode() === "local") return "local";
  return online() && !failingOver ? "online" : "local";
}

/** Short wording for the status pill. */
export function databaseModeLabel(): string {
  if (databaseModeLocked()) return "Online";
  if (preferredDatabaseMode() === "local") return "Local";
  return effectiveDatabaseMode() === "local" ? "Online (local failover)" : "Online";
}

/** Network-class failures mean "try local", unlike a refusal from the database. */
export function isConnectionError(error: unknown): boolean {
  const message = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  return (
    !online() ||
    /failed to fetch|network|load failed|timeout|timed out|econn|fetch failed|offline/.test(message)
  );
}

/** Watch the browser's own connectivity so the pill and mode stay honest. */
export function startDatabaseModeWatch() {
  if (!isBrowser()) return () => {};
  const back = () => noteConnectionRestored();
  const gone = () => noteConnectionLost();
  window.addEventListener("online", back);
  window.addEventListener("offline", gone);
  return () => {
    window.removeEventListener("online", back);
    window.removeEventListener("offline", gone);
  };
}