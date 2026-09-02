/**
 * One place every failure passes through.
 *
 * Database, network and RPC errors arrive as raw Postgres or fetch messages.
 * Staff standing at a till cannot act on "violates foreign key constraint",
 * so each known shape is translated into a plain sentence and shown as a
 * toast. Nothing fails silently.
 */
import { toast } from "sonner";
import { guardNotification, isConnectivityMessage } from "./notification-guard";
import { anyDatabaseReachable } from "@/core/activation/connection-health";

export type NotifyKind = "success" | "info" | "warning" | "error";

type Failure = { message?: string; code?: string; details?: string; hint?: string };

const text = (error: unknown): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as Failure;
  return [e.message, e.details, e.hint].filter(Boolean).join(" — ");
};

/** Turn a backend failure into something a cashier can act on. */
export function describeError(error: unknown, action = "That action"): string {
  const raw = text(error);
  const code = (error as Failure | null)?.code ?? "";

  if (!raw) return `${action} could not be completed.`;

  if (/failed to fetch|networkerror|load failed|offline|network request failed/i.test(raw))
    return `${action} could not reach the central database. It is saved on this terminal and will sync when the connection is back.`;

  if (code === "23503" || /foreign key constraint/i.test(raw))
    return `${action} is blocked because other records still point at this entry. Remove or reassign those records first.`;

  if (code === "23505" || /duplicate key/i.test(raw))
    return `${action} is blocked because a record with the same unique value already exists.`;

  if (code === "23502" || /null value in column/i.test(raw))
    return `${action} is missing a required field.`;

  if (
    code === "42501" ||
    code === "PGRST301" ||
    /row-level security|permission denied|not authori[sz]ed|unauthorized|forbidden/i.test(raw)
  )
    return `${action} is not allowed for this account. Ask a manager or admin to do it.`;

  if (/jwt|session expired|\b401\b/i.test(raw))
    return "Your session has ended. Sign in again to continue.";

  if (/PGRST20\d|schema cache|could not find the/i.test(raw))
    return `${action} failed because the database is missing a field this version expects. Run the latest database script.`;

  return `${action} failed: ${raw}`;
}

/** Show a message. The single entry point for all user-facing notifications. */
export function showNotification(message: string, kind: NotifyKind = "info", description?: string) {
  const options = description ? { description } : undefined;
  const emit = () => {
    if (kind === "success") return toast.success(message, options);
    if (kind === "error") return toast.error(message, options);
    if (kind === "warning") return toast.warning(message, options);
    return toast(message, options);
  };
  // A connectivity complaint is only true when nothing at all is reachable.
  if (kind === "success") return emit();
  return guardNotification(message, emit);
}

/** Report a caught failure as a readable popup and return the message shown. */
export function notifyError(error: unknown, action = "That action"): string {
  // Neither this terminal nor the central database would take the change:
  // that needs a modal the operator has to acknowledge, not a passing toast.
  if ((error as { name?: string } | null)?.name === "AllTargetsFailed") {
    const message = (error as Error).message;
    // Blocking modal only when both databases really are gone.
    void anyDatabaseReachable().then((reachable) => {
      if (reachable || typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("pos:db-unreachable", { detail: { message, action } }));
    });
    return message;
  }
  const message = describeError(error, action);
  if (isConnectivityMessage(message)) guardNotification(message, () => toast.error(message));
  else showNotification(message, "error");
  return message;
}

/**
 * Run work and surface any failure as a popup instead of a silent break.
 * Returns the result, or null when it failed.
 */
export async function withNotify<T>(action: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    notifyError(error, action);
    return null;
  }
}