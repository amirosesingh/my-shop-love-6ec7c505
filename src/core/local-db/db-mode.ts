/**
 * Where this till reads and writes: the online database, or the local one.
 *
 * Web and Android are online-only and send every change straight to the central
 * database. Windows stores every change in its local SQL Server transaction
 * first, then the Electron worker synchronizes it to the central database.
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
  // Kept as a compatibility seam for older callers and stored preferences.
  // Platform policy is no longer operator-selectable: Windows is local-first;
  // web and Android are online-only.
  if (isBrowser()) window.localStorage.removeItem(KEY);
  if (mode === defaultDatabaseMode()) failingOver = false;
  notify();
}

/** Platform policy pins the mode on every build. */
export const databaseModeLocked = (): boolean => true;

/** Whether the central connection monitor currently reports a lost line. */
export const isFailingOver = (): boolean => failingOver;

/** Whether an online-only client most recently wrote directly to the cloud. */
export const isCloudDirect = (): boolean => cloudDirect;

export function setCloudDirect(on: boolean) {
  if (cloudDirect === on) return;
  cloudDirect = on;
  notify();
}

/**
 * Wording for a total failure, in the operator's terms for this platform.
 *
 * Web and Android are live clients of the central server. Windows must commit
 * to local SQL before its worker can synchronize the change centrally.
 */
export function unreachableMessage(): string {
  return isOnlineOnly()
    ? "Shift cannot be opened: Central server relay is offline. Please contact an administrator."
    : "Local Database Required: Unable to save to this terminal's SQL database. " +
        "Please check the local database connection.";
}

/**
 * Raised when the platform's required durable target refuses a change. Nothing
 * was written; the caller must stop and tell the operator.
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

/** Called when the central connection monitor loses its line. */
export function noteConnectionLost() {
  if (failingOver) return;
  failingOver = true;
  notify();
}

/** Called when the central connection monitor sees the line return. */
export function noteConnectionRestored() {
  if (!failingOver) return;
  failingOver = false;
  notify();
}

const online = () => !isBrowser() || window.navigator.onLine;

/**
 * Where writes go on this platform: central for live clients, local SQL for
 * the Windows till.
 */
export function effectiveDatabaseMode(): DatabaseMode {
  return isOnlineOnly() ? "online" : "local";
}

/** Short wording for the status pill. */
export function databaseModeLabel(): string {
  if (cloudDirect) return "Cloud direct";
  return effectiveDatabaseMode() === "local" ? "Local first" : "Online";
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
