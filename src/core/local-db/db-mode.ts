/**
 * Where this till reads and writes: the online database, or the local one.
 *
 * Web and Android are online-only and send every change straight to the central
 * database. Windows first commits every business change to its embedded SQLite
 * durability store. The Electron worker then synchronizes it centrally, while
 * SQL Server is maintained as a compatibility projection.
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
 * A Windows till is local-first and reconciles in the background. Browser and
 * Android clients have no local business database and remain online-only.
 */
export const defaultDatabaseMode = (): DatabaseMode => (hasFeature("localDb") ? "local" : "online");

/** The mode fixed by the running platform. */
export function preferredDatabaseMode(): DatabaseMode {
  return defaultDatabaseMode();
}

export function setPreferredDatabaseMode(mode: DatabaseMode) {
  if (isBrowser()) window.localStorage.removeItem(KEY);
  if (mode === defaultDatabaseMode()) failingOver = false;
  notify();
}

export const databaseModeLocked = (): boolean => true;
export const isFailingOver = (): boolean => failingOver;
export const isCloudDirect = (): boolean => cloudDirect;

export function setCloudDirect(on: boolean) {
  if (cloudDirect === on) return;
  cloudDirect = on;
  notify();
}

export function unreachableMessage(): string {
  return isOnlineOnly()
    ? "Central database unavailable. Please check the network connection or contact an administrator."
    : "Local transaction storage unavailable. The payment was not accepted. " +
        "Open Settings → Database & Cloud Connection and check Trading Ready / SQLite durability.";
}

function localFailureMessage(cause?: unknown): string {
  const error = cause as { message?: string; code?: string } | undefined;
  const detail = String(error?.message ?? "");
  const code = String(error?.code ?? "").toUpperCase();

  if (code === "EBRIDGE_UNAVAILABLE" || /Electron database bridge unavailable/i.test(detail)) {
    return "Electron database bridge unavailable. Restart the Retail desktop app.";
  }
  if (/cannot commit an atomic SQLite batch|update the app/i.test(detail)) {
    return "This Retail desktop build cannot use the required local transaction store. Update the app before taking payments.";
  }
  if (code.includes("SQLITE_SCHEMA") || /SQLite.*schema|schema.*SQLite|no such table|no such column/i.test(detail)) {
    return "Local SQLite schema is not ready. Repair the local database from Settings before taking payments.";
  }
  if (code.includes("SQLITE_WRITE") || /SQLite.*write|write.*SQLite|readonly database|database is locked|disk.*full/i.test(detail)) {
    return "Local SQLite write failed. The payment was not accepted. Check local storage and database health, then retry.";
  }
  if (code.includes("SQLITE") || /SQLite|embedded SQLite|localMirrorBatch|local transaction store/i.test(detail)) {
    return "Local SQLite store unavailable. The payment was not accepted. Check Trading Ready / SQLite durability in Settings.";
  }
  return unreachableMessage();
}

export class AllTargetsFailed extends Error {
  readonly context: string;
  constructor(context: string, cause?: unknown) {
    super(`${context}: ${localFailureMessage(cause)}`);
    this.name = "AllTargetsFailed";
    this.context = context;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export function noteConnectionLost() {
  if (failingOver) return;
  failingOver = true;
  notify();
}

export function noteConnectionRestored() {
  if (!failingOver) return;
  failingOver = false;
  notify();
}

const online = () => !isBrowser() || window.navigator.onLine;

export function effectiveDatabaseMode(): DatabaseMode {
  return isOnlineOnly() ? "online" : "local";
}

export function databaseModeLabel(): string {
  if (cloudDirect) return "Cloud direct";
  return effectiveDatabaseMode() === "local" ? "Local first" : "Online";
}

export function isConnectionError(error: unknown): boolean {
  const message = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  return (
    !online() ||
    /failed to fetch|network|load failed|timeout|timed out|econn|fetch failed|offline/.test(message)
  );
}

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
