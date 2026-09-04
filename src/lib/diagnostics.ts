/**
 * Structured diagnostics for failures the till deliberately survives.
 *
 * A sale must never stop because a background check could not be completed,
 * but the failure must not vanish either. Every swallowed failure records one
 * small event here — kind, what it was about, a reason code and where it
 * happened — and the Data Sync & Audit hub shows them.
 *
 * Events carry identifiers and codes only. Never PINs, tokens, passwords,
 * prices, totals or customer details.
 */
import { recordSync } from "./sync-audit";

export type DiagnosticKind =
  | "backend_object_missing"
  | "stock_delta_failed"
  | "stock_reconcile_drift"
  | "local_mirror_failed"
  | "sale_idempotency_unavailable"
  | "shift_lookup_unavailable"
  /** Part of a basket was stored and the rest was parked for retry. */
  | "partial_commit"
  /** A visibility-only write (sign-in log, drawer opening) could not be stored. */
  | "soft_write_failed";


export type DiagnosticEvent = {
  id: string;
  at: string;
  kind: DiagnosticKind;
  entity: string;
  code: string;
  recordId?: string | null;
  storeId?: string | null;
  terminalId?: string | null;
};

const KEY = "pos.diagnostics";
const LIMIT = 200;

const listeners = new Set<() => void>();

export function subscribeDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const announce = () => {
  for (const l of listeners) l();
};

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Reason codes are short and safe: no free text from a provider is kept. */
export function reasonCode(message: unknown): string {
  const text = String((message as { message?: string })?.message ?? message ?? "").toLowerCase();
  if (!text) return "unknown";
  if (/failed to fetch|network|timeout|econn|offline/.test(text)) return "connection";
  if (/permission|denied|rls|not authorized|401|403/.test(text)) return "not_permitted";
  if (/does not exist|not find|pgrst202|undefined function|schema cache/.test(text))
    return "missing_backend_object";
  if (/duplicate|conflict|409/.test(text)) return "conflict";
  if (/invalid|violates|constraint|22p02|23/.test(text)) return "rejected";
  return "failed";
}

export function listDiagnostics(limit = LIMIT): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return (JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as DiagnosticEvent[]).slice(
      0,
      limit,
    );
  } catch {
    return [];
  }
}

export function clearDiagnostics() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  announce();
}

/** Record one event. Never throws — diagnostics must not break a sale. */
export function recordDiagnostic(input: {
  kind: DiagnosticKind;
  entity: string;
  code: string;
  recordId?: string | null;
  storeId?: string | null;
  terminalId?: string | null;
}): DiagnosticEvent {
  const event: DiagnosticEvent = {
    id: newId(),
    at: new Date().toISOString(),
    kind: input.kind,
    entity: input.entity,
    code: input.code,
    recordId: input.recordId ?? null,
    storeId: input.storeId ?? null,
    terminalId: input.terminalId ?? null,
  };
  try {
    if (typeof window !== "undefined") {
      const next = [event, ...listDiagnostics(LIMIT)].slice(0, LIMIT);
      window.localStorage.setItem(KEY, JSON.stringify(next));
    }
    recordSync({
      direction: "system",
      entity: input.entity,
      status: "failed",
      recordId: event.recordId,
      error: `${event.kind}: ${event.code}`,
    });
  } catch {
    /* diagnostics are best effort */
  }
  announce();
  return event;
}

/** Plain wording for one event, used by the audit hub. */
export const describeDiagnostic = (e: DiagnosticEvent): string => {
  switch (e.kind) {
    case "backend_object_missing":
      return `A required backend routine for ${e.entity} is not installed.`;
    case "stock_delta_failed":
      return `A stock movement for ${e.entity} could not be applied centrally (${e.code}).`;
    case "stock_reconcile_drift":
      return e.code === "stock_mismatch"
        ? `A product's branch stock does not match the movements applied to it (${e.recordId ?? "unknown"}).`
        : `A stock movement was recorded centrally for a different amount than the till's ledger (${e.recordId ?? "unknown"}).`;
    case "local_mirror_failed":
      return `The terminal copy of ${e.entity} could not be updated (${e.code}).`;
    case "sale_idempotency_unavailable":
      return `The duplicate-checkout check could not be completed (${e.code}).`;
    case "shift_lookup_unavailable":
      return `The shift could not be confirmed centrally (${e.code}).`;
    default:
      return `${e.entity}: ${e.code}`;
  }
};