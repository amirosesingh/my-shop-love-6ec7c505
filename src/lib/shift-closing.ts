/**
 * Client side of the controlled shift-closing workflow.
 *
 * Every step is a call into a database routine: the till never decides what
 * the drawer should hold, never works out the over/short and never writes a
 * closing state itself. All this module does is ask the server to move the
 * shift along and report the state it came back in.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import type { ShiftState } from "@/core/types/pos-types";
import { enqueue } from "./sync-outbox";

export type ShiftCloseStep =
  | { ok: true; state: ShiftState }
  | { ok: false; error: string; queued?: boolean };

/**
 * A closing step that failed because nothing could reach the central database,
 * as opposed to one the server refused. Only the first kind may be parked.
 */
function isUnreachable(message: string): boolean {
  return /could not be reached|Failed to fetch|NetworkError|Load failed|network|offline|timeout|ECONN|fetch failed/i.test(
    message,
  );
}

const fail = (e: unknown, fallback: string): ShiftCloseStep => ({
  ok: false,
  error:
    (typeof e === "object" && e && "message" in e && String((e as { message: string }).message)) ||
    fallback,
});

async function callState(fn: string, args: Record<string, unknown>): Promise<ShiftCloseStep> {
  try {
    const res = await supabase.rpc(fn as never, args as never);
    if (res.error) return fail(res.error, "The closing step was refused.");
    const value = Array.isArray(res.data) ? res.data[0] : res.data;
    const state = (typeof value === "string" ? value : (value as { state?: string })?.state) as
      ShiftState | undefined;
    if (!state) return { ok: false, error: "The server did not confirm the closing step." };
    return { ok: true, state };
  } catch (e) {
    return fail(e, "The central database could not be reached.");
  }
}

/** Step 1 — declare the intent to close, with a mandatory reason. */
export function startShiftClose(
  shiftId: string,
  reason: string,
  terminalId?: string | null,
): Promise<ShiftCloseStep> {
  return callState("shift_close_start", {
    p_shift: shiftId,
    p_reason: reason,
    p_terminal: terminalId ?? null,
  });
}

/**
 * Step 2 — the blind count. The reply is a state only: the cashier is never
 * told the expected figure or the variance.
 */
export async function submitCashCount(
  shiftId: string,
  counted: { cash: number; card: number | null; digital: number | null },
  opts: { clientKey?: string; terminalId?: string | null } = {},
): Promise<ShiftCloseStep> {
  const args = {
    p_shift: shiftId,
    p_cash: counted.cash,
    p_card: counted.card,
    p_digital: counted.digital,
    p_client_key: opts.clientKey ?? `${shiftId}:original`,
    p_terminal: opts.terminalId ?? null,
  };
  const res = await callState("shift_cash_count_submit", args);
  if (res.ok || !isUnreachable(res.error)) return res;
  // The line is down. The count is parked exactly as the server would have
  // received it and replayed on reconnect; the database still works out the
  // variance, and the client key means a replay cannot count the drawer twice.
  enqueue("Cash count (waiting for the line)", {
    kind: "rpc",
    table: "shift_cash_counts",
    fn: "shift_cash_count_submit",
    args,
  });
  return {
    ok: false,
    queued: true,
    error:
      "No connection to the central database. The count is saved on this till and will be sent as soon as the line is back.",
  };
}

/** An authorised recount — always kept alongside the original count. */
export function submitRecount(
  shiftId: string,
  counted: { cash: number; card: number | null; digital: number | null },
  reason: string,
  terminalId?: string | null,
): Promise<ShiftCloseStep> {
  return callState("shift_recount_submit", {
    p_shift: shiftId,
    p_cash: counted.cash,
    p_reason: reason,
    p_card: counted.card,
    p_digital: counted.digital,
    p_terminal: terminalId ?? null,
  });
}

/** A supervisor accepts the difference and the shift finally closes. */
export function approveVariance(shiftId: string, note?: string): Promise<ShiftCloseStep> {
  return callState("shift_variance_approve", { p_shift: shiftId, p_note: note ?? null });
}

/** Where the server thinks this shift is right now. */
export async function readShiftState(shiftId: string): Promise<ShiftState | null> {
  try {
    const res = await supabase.rpc("shift_state" as never, { p_shift: shiftId } as never);
    if (res.error) return null;
    const value = Array.isArray(res.data) ? res.data[0] : res.data;
    return (value as ShiftState) ?? null;
  } catch {
    return null;
  }
}

export type ShiftReconciliation = {
  expectedCash: number;
  expectedCard: number;
  expectedDigital: number;
  countedCash: number | null;
  countedCard: number | null;
  countedDigital: number | null;
  varianceCash: number | null;
  varianceCard: number | null;
  varianceDigital: number | null;
  varianceTotal: number | null;
  varianceStatus: string;
  createdAt: string;
};

/**
 * The manager view of a closure. Access is enforced in the database — a
 * cashier's request simply comes back empty.
 */
export async function loadReconciliations(shiftId: string): Promise<ShiftReconciliation[]> {
  try {
    const res = await supabase
      .from("shift_reconciliations" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      expectedCash: Number(r["expected_cash"] ?? 0),
      expectedCard: Number(r["expected_card"] ?? 0),
      expectedDigital: Number(r["expected_digital"] ?? 0),
      countedCash: r["counted_cash"] == null ? null : Number(r["counted_cash"]),
      countedCard: r["counted_card"] == null ? null : Number(r["counted_card"]),
      countedDigital: r["counted_digital"] == null ? null : Number(r["counted_digital"]),
      varianceCash: r["variance_cash"] == null ? null : Number(r["variance_cash"]),
      varianceCard: r["variance_card"] == null ? null : Number(r["variance_card"]),
      varianceDigital: r["variance_digital"] == null ? null : Number(r["variance_digital"]),
      varianceTotal: r["variance_total"] == null ? null : Number(r["variance_total"]),
      varianceStatus: String(r["variance_status"] ?? ""),
      createdAt: String(r["created_at"] ?? ""),
    }));
  } catch {
    return [];
  }
}

export type ShiftCashCount = {
  id: string;
  kind: "ORIGINAL" | "RECOUNT";
  countedCash: number;
  countedCard: number | null;
  countedDigital: number | null;
  reason: string | null;
  countedByName: string | null;
  createdAt: string;
};

/** Every count ever taken on a shift, oldest first — nothing is overwritten. */
export async function loadCashCounts(shiftId: string): Promise<ShiftCashCount[]> {
  try {
    const res = await supabase
      .from("shift_cash_counts" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      id: String(r["id"]),
      kind: (r["kind"] as "ORIGINAL" | "RECOUNT") ?? "ORIGINAL",
      countedCash: Number(r["counted_cash"] ?? 0),
      countedCard: r["counted_card"] == null ? null : Number(r["counted_card"]),
      countedDigital: r["counted_digital"] == null ? null : Number(r["counted_digital"]),
      reason: (r["reason"] as string) ?? null,
      countedByName: (r["counted_by_name"] as string) ?? null,
      createdAt: String(r["created_at"] ?? ""),
    }));
  } catch {
    return [];
  }
}

export type ShiftCloseEvent = {
  id: string;
  event: string;
  fromState: string | null;
  toState: string | null;
  actorName: string | null;
  createdAt: string;
};

/** The append-only closing trail for one shift. */
export async function loadCloseEvents(shiftId: string): Promise<ShiftCloseEvent[]> {
  try {
    const res = await supabase
      .from("shift_close_events" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      id: String(r["id"]),
      event: String(r["event"] ?? ""),
      fromState: (r["from_state"] as string) ?? null,
      toState: (r["to_state"] as string) ?? null,
      actorName: (r["actor_name"] as string) ?? null,
      createdAt: String(r["created_at"] ?? ""),
    }));
  } catch {
    return [];
  }
}
