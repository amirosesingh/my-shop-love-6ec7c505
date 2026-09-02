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
import { isOnlineOnly } from "@/lib/live-mode";
import { hasFeature } from "@/platform-config/features";

export type DatabaseMode = "online" | "local";

const KEY = "pos.db.mode";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Set while an online-mode write could not reach the central database. */
let failingOver = false;

/** Set while this till is writing straight to the cloud because the local store failed. */
let cloudDirect = false;

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

/**
 * A till keeps trading when the line drops, so the Windows shell is
 * local-first and reconciles in the background. The browser console has no
 * local database engine, so it stays online-first with local failover.
 */
export const defaultDatabaseMode = (): DatabaseMode => (hasFeature("localDb") ? "local" : "online");

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
export const databaseModeLocked = (): boolean => isOnlineOnly();

/** Has the app dropped to local working because the connection failed? */
export const isFailingOver = (): boolean => failingOver;

/** Is the till bypassing local storage and writing straight to the cloud? */
export const isCloudDirect = (): boolean => cloudDirect;

export function setCloudDirect(on: boolean) {
  if (cloudDirect === on) return;
  cloudDirect = on;
  notify();
}

/**
 * Wording for a total failure, in the operator's terms for this platform.
 *
 * The phone is a live client of the central server, so there is no local
 * database to mention; Windows and the browser have both targets.
 */
export function unreachableMessage(): string {
  return isOnlineOnly()
    ? "Shift cannot be opened: Central server relay is offline. Please contact an administrator."
    : "Database Connection Required: Unable to reach the local database server or online database. " +
        "Please check your network connection.";
}

/**
 * Raised only when neither this terminal nor the central database would take
 * the change. Nothing was written; the caller must stop and tell the operator.
 */
export class AllTargetsFailed extends Error {
  readonly context: string;
  constructor(context: string, cause?: unknown) {
    super(unreachableMessage());
    this.name = "AllTargetsFailed";
    this.context = context;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

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
  if (isOnlineOnly()) return "online";
  if (preferredDatabaseMode() === "local") return "local";
  return online() && !failingOver ? "online" : "local";
}

/** Short wording for the status pill. */
export function databaseModeLabel(): string {
  if (cloudDirect) return "Cloud direct";
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
