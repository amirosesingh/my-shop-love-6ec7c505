# Booking money: verification pass + refunds & overpayment

Today's booking work (server-authoritative collection, partial payments, mandatory cancellation reason) is in place at v1.3.61. Two follow-ups remain: prove it behaves correctly end to end, and cover the money cases it deliberately left out.

## Part 1 — End-to-end verification

Drive the running app in a headless browser against the bookings screen and confirm the real behaviour, not just the code:

1. Create a booking with a deposit, then take a partial payment. Confirm the outstanding figure comes back from the server and the list reflects it after a reload.
2. Attempt handover/collection while a balance is still owed. Confirm it is blocked with the counter-friendly "balance is still outstanding" message.
3. Pay off the remainder and confirm the booking moves to collected in the same action.
4. Double-click / retry a payment. Confirm the stable client payment id prevents a second charge and the duplicate is reported quietly rather than as an error.
5. Cancel a booking with the reason dialog. Confirm an empty reason is refused, and the stored reason, who cancelled, and when all appear in the list.
6. Capture any console or network errors seen along the way.

Anything that fails gets fixed in the same pass, then re-run.

## Part 2 — Refunds and overpayment

Currently the server rejects any payment larger than the outstanding balance, and there is no way to give money back. Add:

- **Refunds.** A refund action on a booking that has settled payments, gated by permission and requiring a reason. It records a negative-value payment row (method, amount, reason, who, when) rather than deleting history, and re-derives the balance from the server afterwards. Refunds are capped at what was actually settled.
- **Overpayment as change.** When cash tendered exceeds the outstanding amount, treat the excess as change due at the counter (shown to the cashier) instead of refusing the payment outright. Non-cash methods keep the current strict refusal.
- **Cancellation with money on it.** Cancelling a booking that already has settled payments prompts for what happens to the money — refund it or retain it — and records that choice with the cancellation reason.
- **Visibility.** Refunds appear in the booking's payment history and on the receipt/print path with a clear refund label, and net paid (payments minus refunds) is what drives the outstanding figure everywhere.

## Technical notes

- New/updated database routines alongside `booking_balance_state`, `booking_collect`, `booking_cancel`: a `booking_refund` routine that validates the cap, writes the reversal row, and returns the same balance-state shape. Balance derivation switches to net-of-refunds.
- `booking_payments` gains refund metadata (kind/reason/refunds-payment link); mirrored into `database/schema.sql` guarded statements and `src/lib/central-schema.ts` so offline SQL Server and drift detection stay aligned.
- `src/lib/booking-collection.ts` gains a `refundBookingPayment` wrapper with the same retry-safe client id pattern and coded-error translation; new codes added to `readable()`.
- `src/lib/pos-store.tsx` exposes an async `refundBooking`; `src/routes/bookings.tsx` gains the refund dialog, the change-due display, and the cancel-with-money prompt.
- Version bumped via `scripts/bump-version.cjs`; tests run and extended for the refund/overpayment maths.
