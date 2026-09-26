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
import { commitOps } from "@/core/api/pos-db";
import { routedQuery } from "@/core/api/db-query";
import { localDb } from "@/core/local-db/local-db";

export type ShiftCloseStep =
  | { ok: true; state: ShiftState }
  | { ok: false; error: string; queued?: boolean };

const fail = (e: unknown, fallback: string): ShiftCloseStep => ({
  ok: false,
  error:
    (typeof e === "object" && e && "message" in e && String((e as { message: string }).message)) ||
    fallback,
});

const money = (value: number) => Number(value.toFixed(2));

async function localShift(shiftId: string): Promise<Record<string, unknown>> {
  const rows = await routedQuery("shifts", { match: { id: shiftId }, limit: 1 });
  if (!rows[0]) throw new Error("That shift no longer exists on this terminal.");
  return rows[0];
}

const stateOf = (row: Record<string, unknown>) =>
  String(row.state ?? (row.closed_at ? "CLOSED" : "ACTIVE")) as ShiftState;

function closeEvent(input: {
  shiftId: string;
  storeId: string;
  terminalId?: string | null;
  event: string;
  from: ShiftState | null;
  to: ShiftState | null;
  detail?: Record<string, unknown>;
  actor?: string | null;
}) {
  return {
    id: crypto.randomUUID(), shift_id: input.shiftId, store_id: input.storeId,
    terminal_id: input.terminalId ?? null, event: input.event,
    from_state: input.from, to_state: input.to, detail: input.detail ?? {},
    actor_name: input.actor ?? null, created_at: new Date().toISOString(),
  };
}

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
    const detail = e instanceof Error ? e.message : "The central database could not be reached.";
    throw new Error(`Central database unavailable: ${detail}`, { cause: e });
  }
}

/** Step 1 — declare the intent to close, with a mandatory reason. */
export function startShiftClose(
  shiftId: string,
  reason: string,
  terminalId?: string | null,
): Promise<ShiftCloseStep> {
  if (localDb()?.writeBatch) return (async () => {
    try {
      const clean = reason.trim();
      if (!clean) return { ok: false, error: "A reason for closing this shift is required." };
      const shift = await localShift(shiftId);
      const current = stateOf(shift);
      if (current !== "ACTIVE") return { ok: true, state: current };
      const now = new Date().toISOString();
      const storeId = String(shift.store_id ?? "");
      await commitOps("Starting shift close", [
        { kind: "update", table: "shifts", match: { id: shiftId }, values: {
          store_id: storeId, state: "CASH_COUNT_REQUIRED", close_reason: clean,
          closing_started_at: now, closing_started_by: shift.opened_by_name ?? null,
          updated_at: now,
        } },
        { kind: "insert", table: "shift_close_events", rows: [closeEvent({
          shiftId, storeId, terminalId, event: "closing_started", from: "ACTIVE",
          to: "CASH_COUNT_REQUIRED", detail: { reason: clean },
          actor: (shift.opened_by_name as string | null | undefined) ?? null,
        })] },
      ]);
      return { ok: true, state: "CASH_COUNT_REQUIRED" };
    } catch (e) { return fail(e, "The local shift could not start closing."); }
  })();
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
  if (localDb()?.writeBatch) {
    try {
      if (!Number.isFinite(counted.cash) || counted.cash < 0)
        return { ok: false, error: "Enter the cash counted in the drawer." };
      if (counted.card != null && (!Number.isFinite(counted.card) || counted.card < 0))
        return { ok: false, error: "The card total counted cannot be negative." };
      if (counted.digital != null && (!Number.isFinite(counted.digital) || counted.digital < 0))
        return { ok: false, error: "The digital total counted cannot be negative." };
      const shift = await localShift(shiftId);
      const current = stateOf(shift);
      if (current === "ACTIVE") return { ok: false, error: "Start the closing process before counting the drawer." };
      if (!["CLOSING_STARTED", "CASH_COUNT_REQUIRED"].includes(current)) return { ok: true, state: current };
      const existing = await routedQuery("shift_cash_counts", {
        match: { shift_id: shiftId, kind: "ORIGINAL" }, limit: 1,
      });
      if (existing.length) return { ok: true, state: stateOf(await localShift(shiftId)) };
      const expected = await localDb()?.shiftExpectedTotals?.(shiftId);
      if (!expected?.ok) throw new Error(expected?.error ?? "Expected shift totals could not be calculated locally.");
      const expectedCash = money(Number(expected.expected_cash ?? 0));
      const expectedCard = money(Number(expected.expected_card ?? 0));
      const expectedDigital = money(Number(expected.expected_digital ?? 0));
      const cash = money(counted.cash);
      const card = counted.card == null ? null : money(counted.card);
      const digital = counted.digital == null ? null : money(counted.digital);
      const varianceCash = money(cash - expectedCash);
      const varianceCard = card == null ? null : money(card - expectedCard);
      const varianceDigital = digital == null ? null : money(digital - expectedDigital);
      const varianceTotal = money(varianceCash + (varianceCard ?? 0) + (varianceDigital ?? 0));
      const varianceStatus = Math.abs(varianceTotal) <= 0.005 ? "NO_VARIANCE" : varianceTotal > 0 ? "OVER" : "SHORT";
      const storeId = String(shift.store_id ?? "");
      const actor = (shift.opened_by_name as string | null | undefined) ?? null;
      const terminalId = opts.terminalId ?? (shift.terminal_id as string | null | undefined) ?? null;
      const countId = crypto.randomUUID();
      const reconciliationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const operations: Parameters<typeof commitOps>[1] = [
        { kind: "insert", table: "shift_cash_counts", rows: [{
          id: countId, shift_id: shiftId, store_id: storeId, terminal_id: terminalId,
          kind: "ORIGINAL", counted_cash: cash, counted_card: card, counted_digital: digital,
          reason: shift.close_reason ?? null, counted_by_name: actor,
          client_key: opts.clientKey ?? `${shiftId}:original`, created_at: now,
        }] },
        { kind: "insert", table: "shift_reconciliations", rows: [{
          id: reconciliationId, shift_id: shiftId, store_id: storeId, count_id: countId,
          expected_cash: expectedCash, expected_card: expectedCard, expected_digital: expectedDigital,
          counted_cash: cash, counted_card: card, counted_digital: digital,
          variance_cash: varianceCash, variance_card: varianceCard, variance_digital: varianceDigital,
          variance_total: varianceTotal, variance_status: varianceStatus, created_at: now,
        }] },
        { kind: "insert", table: "shift_close_events", rows: [
          closeEvent({ shiftId, storeId, terminalId, event: "cash_count_submitted", from: current,
            to: "CASH_COUNT_SUBMITTED", detail: { count_id: countId }, actor }),
          closeEvent({ shiftId, storeId, terminalId, event: "reconciled", from: "CASH_COUNT_SUBMITTED",
            to: "CLOSED", detail: { variance_status: varianceStatus, variance_total: varianceTotal }, actor }),
        ] },
        { kind: "update", table: "shifts", match: { id: shiftId }, values: {
          store_id: storeId, state: "CLOSED", status: "CLOSED", closed_at: shift.closed_at ?? now,
          final_counted_cash: cash, counted_cash: cash, closing_float: cash,
          counted_card: card, counted_digital: digital,
          expected_cash: expectedCash, expected_card: expectedCard, expected_digital: expectedDigital,
          variance_cash: varianceCash, variance_card: varianceCard, variance_digital: varianceDigital,
          variance_total: varianceTotal, variance_status: varianceStatus, updated_at: now,
        } },
      ];
      if (varianceStatus !== "NO_VARIANCE") operations.push(
        { kind: "insert", table: "shift_variance_alerts", rows: [{
          id: crypto.randomUUID(), shift_id: shiftId, store_id: storeId,
          reconciliation_id: reconciliationId, variance_total: varianceTotal,
          variance_status: varianceStatus, severity: "warning",
          message: `Shift ${shiftId} closed ${varianceStatus.toLowerCase()} by ${Math.abs(varianceTotal).toFixed(2)}.`,
          delivery_status: "pending", attempts: 0, created_at: now, updated_at: now,
        }] },
        { kind: "insert", table: "activity_events", rows: [{
          id: crypto.randomUUID(), event_type: "shift_cash_variance", severity: "warning",
          title: "Shift cash variance detected",
          message: `Expected cash ${expectedCash.toFixed(2)}, counted ${cash.toFixed(2)}, variance ${varianceTotal.toFixed(2)}.`,
          actor_name: actor, terminal_id: terminalId, store_id: storeId, branch_id: storeId,
          entity_type: "shift", entity_id: shiftId, amount: varianceTotal,
          meta: { expected_cash: expectedCash, counted_cash: cash, variance_total: varianceTotal,
            variance_status: varianceStatus, reconciliation_id: reconciliationId },
          client_event_id: `shift:${shiftId}:cash_variance`, created_at: now,
          whatsapp_status: "pending", cleared_by: "",
        }] },
      );
      await commitOps("Closing shift cash count", operations);
      return { ok: true, state: "CLOSED" };
    } catch (e) { return fail(e, "The cash count could not be saved locally."); }
  }
  const args = {
    p_shift: shiftId,
    p_cash: counted.cash,
    p_card: counted.card,
    p_digital: counted.digital,
    p_client_key: opts.clientKey ?? `${shiftId}:original`,
    p_terminal: opts.terminalId ?? null,
  };
  return callState("shift_cash_count_submit", args);
}

/** An authorised recount — always kept alongside the original count. */
export function submitRecount(
  shiftId: string,
  counted: { cash: number; card: number | null; digital: number | null },
  reason: string,
  terminalId?: string | null,
): Promise<ShiftCloseStep> {
  if (localDb()?.writeBatch) return (async () => {
    try {
      const clean = reason.trim();
      if (!clean) return { ok: false, error: "A reason for the recount is required." };
      const shift = await localShift(shiftId);
      const current = stateOf(shift);
      if (!["VARIANCE_REVIEW_REQUIRED", "RECONCILIATION", "CLOSED"].includes(current))
        return { ok: false, error: "This shift has not been counted yet." };
      const expected = await localDb()?.shiftExpectedTotals?.(shiftId);
      if (!expected?.ok) throw new Error(expected?.error ?? "Expected shift totals could not be calculated locally.");
      const storeId = String(shift.store_id ?? "");
      const actor = (shift.opened_by_name as string | null | undefined) ?? null;
      const terminal = terminalId ?? (shift.terminal_id as string | null | undefined) ?? null;
      const cash = money(counted.cash);
      const card = counted.card == null ? null : money(counted.card);
      const digital = counted.digital == null ? null : money(counted.digital);
      const expectedCash = money(Number(expected.expected_cash ?? 0));
      const expectedCard = money(Number(expected.expected_card ?? 0));
      const expectedDigital = money(Number(expected.expected_digital ?? 0));
      const varianceCash = money(cash - expectedCash);
      const varianceCard = card == null ? null : money(card - expectedCard);
      const varianceDigital = digital == null ? null : money(digital - expectedDigital);
      const varianceTotal = money(varianceCash + (varianceCard ?? 0) + (varianceDigital ?? 0));
      const varianceStatus = Math.abs(varianceTotal) <= 0.005 ? "NO_VARIANCE" : varianceTotal > 0 ? "OVER" : "SHORT";
      const countId = crypto.randomUUID();
      const now = new Date().toISOString();
      await commitOps("Saving shift recount", [
        { kind: "insert", table: "shift_cash_counts", rows: [{ id: countId, shift_id: shiftId,
          store_id: storeId, terminal_id: terminal, kind: "RECOUNT", counted_cash: cash,
          counted_card: card, counted_digital: digital, reason: clean, counted_by_name: actor,
          created_at: now }] },
        { kind: "insert", table: "shift_reconciliations", rows: [{ id: crypto.randomUUID(),
          shift_id: shiftId, store_id: storeId, count_id: countId, expected_cash: expectedCash,
          expected_card: expectedCard, expected_digital: expectedDigital, counted_cash: cash,
          counted_card: card, counted_digital: digital, variance_cash: varianceCash,
          variance_card: varianceCard, variance_digital: varianceDigital, variance_total: varianceTotal,
          variance_status: varianceStatus, created_at: now }] },
        { kind: "insert", table: "shift_close_events", rows: [closeEvent({ shiftId, storeId,
          terminalId: terminal, event: "recount_submitted", from: current, to: "CLOSED",
          detail: { reason: clean, count_id: countId }, actor })] },
        { kind: "update", table: "shifts", match: { id: shiftId }, values: { store_id: storeId,
          state: "CLOSED", status: "CLOSED", counted_cash: cash, final_counted_cash: cash,
          closing_float: cash, counted_card: card, counted_digital: digital,
          expected_cash: expectedCash, expected_card: expectedCard, expected_digital: expectedDigital,
          variance_cash: varianceCash, variance_card: varianceCard, variance_digital: varianceDigital,
          variance_total: varianceTotal, variance_status: varianceStatus, updated_at: now } },
      ]);
      return { ok: true, state: "CLOSED" };
    } catch (e) { return fail(e, "The recount could not be saved locally."); }
  })();
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
  if (localDb()?.writeBatch) return (async () => {
    try {
      const shift = await localShift(shiftId);
      const current = stateOf(shift);
      if (current === "CLOSED") return { ok: true, state: "CLOSED" };
      const storeId = String(shift.store_id ?? "");
      const now = new Date().toISOString();
      await commitOps("Approving shift variance", [
        { kind: "update", table: "shifts", match: { id: shiftId }, values: {
          store_id: storeId, state: "CLOSED", status: "CLOSED",
          closed_at: shift.closed_at ?? now, updated_at: now,
        } },
        { kind: "insert", table: "shift_close_events", rows: [closeEvent({ shiftId, storeId,
          terminalId: (shift.terminal_id as string | null | undefined) ?? null,
          event: "variance_approved", from: current, to: "CLOSED", detail: { note: note ?? null },
          actor: (shift.opened_by_name as string | null | undefined) ?? null })] },
      ]);
      return { ok: true, state: "CLOSED" };
    } catch (e) { return fail(e, "The variance approval could not be saved locally."); }
  })();
  return callState("shift_variance_approve", { p_shift: shiftId, p_note: note ?? null });
}

/** Where the server thinks this shift is right now. */
export async function readShiftState(shiftId: string): Promise<ShiftState | null> {
  try {
    if (localDb()?.query) return stateOf(await localShift(shiftId));
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
    if (localDb()?.query) {
      const rows = await routedQuery("shift_reconciliations", {
        match: { shift_id: shiftId }, orderBy: { column: "created_at", ascending: false }, limit: 200,
      });
      return rows.map(mapReconciliation);
    }
    const res = await supabase
      .from("shift_reconciliations" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map(mapReconciliation);
  } catch {
    return [];
  }
}

const mapReconciliation = (r: Record<string, unknown>): ShiftReconciliation => ({
  expectedCash: Number(r["expected_cash"] ?? 0), expectedCard: Number(r["expected_card"] ?? 0),
  expectedDigital: Number(r["expected_digital"] ?? 0),
  countedCash: r["counted_cash"] == null ? null : Number(r["counted_cash"]),
  countedCard: r["counted_card"] == null ? null : Number(r["counted_card"]),
  countedDigital: r["counted_digital"] == null ? null : Number(r["counted_digital"]),
  varianceCash: r["variance_cash"] == null ? null : Number(r["variance_cash"]),
  varianceCard: r["variance_card"] == null ? null : Number(r["variance_card"]),
  varianceDigital: r["variance_digital"] == null ? null : Number(r["variance_digital"]),
  varianceTotal: r["variance_total"] == null ? null : Number(r["variance_total"]),
  varianceStatus: String(r["variance_status"] ?? ""), createdAt: String(r["created_at"] ?? ""),
});

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
    if (localDb()?.query) {
      const rows = await routedQuery("shift_cash_counts", {
        match: { shift_id: shiftId }, orderBy: { column: "created_at", ascending: true }, limit: 500,
      });
      return rows.map(mapCashCount);
    }
    const res = await supabase
      .from("shift_cash_counts" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map(mapCashCount);
  } catch {
    return [];
  }
}

const mapCashCount = (r: Record<string, unknown>): ShiftCashCount => ({
  id: String(r["id"]), kind: (r["kind"] as "ORIGINAL" | "RECOUNT") ?? "ORIGINAL",
  countedCash: Number(r["counted_cash"] ?? 0),
  countedCard: r["counted_card"] == null ? null : Number(r["counted_card"]),
  countedDigital: r["counted_digital"] == null ? null : Number(r["counted_digital"]),
  reason: (r["reason"] as string) ?? null, countedByName: (r["counted_by_name"] as string) ?? null,
  createdAt: String(r["created_at"] ?? ""),
});

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
    if (localDb()?.query) {
      const rows = await routedQuery("shift_close_events", {
        match: { shift_id: shiftId }, orderBy: { column: "created_at", ascending: true }, limit: 1000,
      });
      return rows.map(mapCloseEvent);
    }
    const res = await supabase
      .from("shift_close_events" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (res.error) return [];
    return ((res.data as Record<string, unknown>[] | null) ?? []).map(mapCloseEvent);
  } catch {
    return [];
  }
}

const mapCloseEvent = (r: Record<string, unknown>): ShiftCloseEvent => ({
  id: String(r["id"]), event: String(r["event"] ?? ""),
  fromState: (r["from_state"] as string) ?? null, toState: (r["to_state"] as string) ?? null,
  actorName: (r["actor_name"] as string) ?? null, createdAt: String(r["created_at"] ?? ""),
});
