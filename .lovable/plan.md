# Booking & job payment status, collection flow and cancellation reason

## What the audit found (verified in code and database)

**Record Job / booking creation** — `createBooking` in `src/lib/pos-store.tsx` writes the booking through `commitBooking` (`src/lib/bookings-db.ts`), which falls back to the offline queue. This flow works and stays untouched.

**Payment truth is client-side.** `bookingBalance()` in `src/lib/pos-types.ts` is `total - paid`, where `paid` is a plain column on `bookings` that the till writes itself. Payments also live in `booking_payments`, but nothing reconciles the two. There is no reversal/void flag on `booking_payments` today.

**"Collected" can bypass payment.** In `src/routes/bookings.tsx`:
- `changeJobStatus(..., "collected", balance)` only blocks on balance when the branch rule `blockCollectionWithBalance` is on; when it is off, a permission check is enough and the job is flipped to collected with an outstanding balance.
- `setBookingJobStatus` in the store writes the status straight to the row via `saveBookingQuietly` — no backend validation.
- `collectBooking` clamps the settled amount to the balance but sets `status: 'collected'` regardless of whether the customer actually paid it.

**Database has no guard.** The only booking triggers are `enforce_booking_permissions` (discount permission only) and `booking_payment_within_total` (payment cannot exceed total). Nothing prevents an update that sets `status = 'collected'` or `job_status = 'collected'` while a balance remains.

**Cancellation has no reason.** The Cancel button calls `cancelBooking(b.id, "Cancelled at counter")` — a hard-coded string. `cancelBooking` appends it to the free-text `note` field. There are no `cancel_reason`, `cancelled_by`, `cancelled_at` columns on `bookings`. (The job-card "Cancelled"/"Damaged" path does already demand an incident note — that dialog is kept and reused.)

## Plan

### 1. Authoritative payment state (backend)
- Add to `booking_payments`: a `status` column (`settled` / `reversed` / `void`, default `settled`), plus `reversed_at`, `reversed_by`, so failed or reversed tenders can never count as paid.
- Add to `bookings`: `cancel_reason`, `cancelled_by`, `cancelled_at`, `cancelled_terminal`.
- New security-definer routine `booking_balance_state(booking_id)` returning total, settled paid, outstanding and a `fully_paid` flag, computed from `booking_payments` where `status = 'settled'` — this becomes the single source of truth.
- New routine `booking_collect(booking_id, amount, method, reference, client_payment_id)` that, inside one transaction: re-reads the authoritative balance, rejects an amount above the outstanding, records the payment idempotently on `client_payment_id` (so a double submit or two terminals cannot double-collect), recomputes the balance and only then sets `status = 'collected'` / `job_status = 'collected'`. It checks `can_collect_booking` through the existing `has_perm`.
- New routine `booking_cancel(booking_id, reason, terminal)` that rejects an empty or whitespace-only reason, checks `can_cancel_booking`, and stores reason, user and timestamp permanently. The reason is written once and never overwritten by later edits.
- New trigger on `bookings`: any update moving `status` or `job_status` to `collected` is rejected when the authoritative outstanding balance exceeds the money tolerance (0.005). This closes the "call the API directly" bypass regardless of which client path is used.
- Grants and RLS follow the existing booking pattern; the new routines are the only write path for collection and cancellation.

### 2. Collected button behaviour (till)
- Clicking **Collected** (both the job-status chip and the collect action) first re-fetches the authoritative balance for that booking.
- Outstanding within tolerance → move straight to Collected, no payment dialog, existing payment history preserved.
- Outstanding above tolerance (partly paid or unpaid) → open the existing collect-payment dialog pre-filled with **Amount remaining: BND x.xx**, computed from the refreshed backend figure, using the existing payment methods.
- After the payment is submitted, the backend confirms the write and returns the recomputed balance. Zero → the booking moves to Collected and the bill prints as it does today. Still outstanding → it stays where it is and the remaining amount is shown again.
- The dialog's submit button is disabled while a request is in flight, and a stale-balance response (someone else already paid) refreshes the screen instead of taking a second payment.

### 3. Cancellation reason
- The Cancel action opens a **Cancel booking / job** dialog: mandatory reason box, **Back** and **Confirm cancellation** buttons, confirm disabled until the trimmed reason is non-empty.
- Only on confirm does `booking_cancel` run; the existing navigation and "stock released" toast happen after it succeeds.
- The stored reason, who cancelled and when are shown on the cancelled booking card for users allowed to see it.

### 4. Permissions
Reuses the existing flags — `can_collect_booking` for taking payment and completing collection, `can_cancel_booking` for cancelling — but they are now enforced in the database routines as well as in the UI, so a direct API call cannot skip them.

### 5. Code to review before removal (nothing deleted without your approval)
After the new path is in, these become redundant. I will list each with its dependants and risk and wait for your yes/no before touching them:
- The `blockCollectionWithBalance` branch in `src/routes/bookings.tsx` — collection with a balance becomes impossible, so the rule only decides wording.
- The direct `setBookingJobStatus(id, "collected", ...)` client write and the client-side `status: 'collected'` assignment inside `collectBooking`.
- `bookingBalance()` as a decision input (kept for display only).

## Technical notes
- Migration adds the columns, the three routines and the collected-guard trigger; the same statements are mirrored into `database/schema.sql`, the offline SQL Server mirror and `src/lib/central-schema.ts` so Electron and Android stay in step.
- Files expected to change: `src/routes/bookings.tsx`, `src/lib/pos-store.tsx`, `src/lib/bookings-db.ts`, a new `src/lib/booking-collection.ts` for the authoritative wrappers, `src/lib/pos-types.ts` (payment status field), plus schema mirrors.
- Offline behaviour: when the cloud is unreachable, collection is refused rather than guessed, and part payments continue to queue as they do today; a Collected transition always requires the authoritative confirmation.
- Tests: a unit suite for the balance/eligibility rules (fully paid, partly paid, unpaid, reversed payment ignored, tolerance) and guard tests asserting a direct collected update is rejected while a balance remains.
