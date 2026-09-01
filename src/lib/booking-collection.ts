/**
 * Authoritative booking money.
 *
 * The till may *show* a balance, but it never decides one. Every figure here
 * comes back from the central database, which adds up the settled payments
 * itself and refuses to hand a booking over while anything is still owed.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { MONEY_TOLERANCE, type PaymentMethod } from "./pos-types";

export type BookingBalanceState = {
  total: number;
  settledPaid: number;
  outstanding: number;
  fullyPaid: boolean;
  status: string;
  jobStatus: string | null;
  /** the payment was already recorded (retry / another terminal) */
  duplicate?: boolean;
};

export type BookingMoneyResult =
  | { ok: true; state: BookingBalanceState }
  | { ok: false; error: string };

const message = (e: unknown, fallback: string) =>
  (typeof e === "object" && e && "message" in e && String((e as { message: string }).message)) ||
  fallback;

const toState = (row: Record<string, unknown>): BookingBalanceState => ({
  total: Number(row["total"] ?? 0),
  settledPaid: Number(row["settled_paid"] ?? 0),
  outstanding: Number(row["outstanding"] ?? 0),
  fullyPaid: !!row["fully_paid"],
  status: String(row["status"] ?? ""),
  jobStatus: (row["job_status"] as string) ?? null,
  duplicate: !!row["duplicate"],
});

/** What the server says is still owed on this booking, right now. */
export async function readBookingBalance(bookingId: string): Promise<BookingMoneyResult> {
  try {
    const res = await supabase.rpc("booking_balance_state" as never, {
      _booking_id: bookingId,
    } as never);
    if (res.error) return { ok: false, error: message(res.error, "Balance check failed.") };
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
      | Record<string, unknown>
      | undefined;
    if (!row) return { ok: false, error: "This booking is not in the central database yet." };
    return { ok: true, state: toState(row) };
  } catch (e) {
    return { ok: false, error: message(e, "The central database could not be reached.") };
  }
}

/**
 * Record money against a booking and, when `complete` is set and nothing is
 * left owing, let the server move it to collected in the same transaction.
 * `clientPaymentId` makes a retry safe: the same id is never taken twice.
 */
export async function collectBookingPayment(input: {
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  cashier?: string | null;
  reference?: string | null;
  clientPaymentId: string;
  complete: boolean;
}): Promise<BookingMoneyResult> {
  try {
    const res = await supabase.rpc("booking_collect" as never, {
      _booking_id: input.bookingId,
      _amount: input.amount,
      _method: input.method,
      _cashier: input.cashier ?? null,
      _reference: input.reference ?? null,
      _client_payment_id: input.clientPaymentId,
      _complete: input.complete,
    } as never);
    if (res.error) return { ok: false, error: readable(message(res.error, "Payment refused.")) };
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
      | Record<string, unknown>
      | undefined;
    if (!row) return { ok: false, error: "The server did not confirm the payment." };
    return { ok: true, state: toState(row) };
  } catch (e) {
    return { ok: false, error: message(e, "The central database could not be reached.") };
  }
}

/** Cancel a booking with a reason the server stores for good. */
export async function cancelBookingAuthoritative(input: {
  bookingId: string;
  reason: string;
  cancelledBy?: string | null;
  terminal?: string | null;
}): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await supabase.rpc("booking_cancel" as never, {
      _booking_id: input.bookingId,
      _reason: input.reason,
      _cancelled_by: input.cancelledBy ?? null,
      _terminal: input.terminal ?? null,
    } as never);
    if (res.error)
      return { ok: false, error: readable(message(res.error, "The cancellation was refused.")) };
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
      | Record<string, unknown>
      | undefined;
    if (!row) return { ok: false, error: "The server did not confirm the cancellation." };
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: message(e, "The central database could not be reached.") };
  }
}

/** Turn the server's coded refusals into counter English. */
export function readable(raw: string): string {
  if (raw.includes("PERMISSION_DENIED_COLLECT_BOOKING"))
    return "You do not have permission to collect booking payments.";
  if (raw.includes("PERMISSION_DENIED_CANCEL_BOOKING"))
    return "You do not have permission to cancel bookings.";
  if (raw.includes("CANCEL_REASON_REQUIRED")) return "A cancellation reason is required.";
  if (raw.includes("BOOKING_ALREADY_COLLECTED")) return "This booking has already been collected.";
  if (raw.includes("BOOKING_CANCELLED")) return "This booking was cancelled.";
  if (raw.includes("BOOKING_OVERPAYMENT"))
    return "That is more than the amount still outstanding — refresh and try again.";
  if (raw.includes("BOOKING_BALANCE_DUE"))
    return "A balance is still outstanding, so this booking cannot be marked collected.";
  if (raw.includes("BOOKING_NOT_FOUND")) return "This booking is not in the central database.";
  return raw;
}

export const isSettled = (outstanding: number) => outstanding <= MONEY_TOLERANCE;
