# Shift continuation and multi-cashier terminal sharing

## What already works today (verified in the code)

- On sign-in the till reads the open shift straight from the database for the terminal's branch (`loadActiveShift(storeId)`, matched on branch + not closed, no date logic). If one exists the register unlocks; if not, the lock panel with the opening-float form appears. So Step 1's routing behaviour is in place.
- Locking (`lock()` in the auth provider) signs the user out but never closes the shift; the next PIN sign-in re-reads the same open shift and joins it. Each sign-in writes a `shift_sessions` row through `beginShiftSession`, and sign-out stamps the time.
- Sales, refunds, voids and bookings already stamp the **live signed-in user**, not the shift opener (`activeCashier = user?.name || activeShift?.cashier`).
- Closing already requires the `can_close_shift` permission, a mandatory counted-cash entry, and a server re-check (held bills, cash count) before the shift is written closed.

## The real gaps to close

### 1. Attachment banner (Step 1)
When a user signs in and the till attaches to a shift somebody else opened, show a one-time toast plus a persistent line in the shift strip: "Attached to active shift opened by [Opener] at [Start time]". Today the strip shows the opener and time but never signals that you joined an existing shift.

### 2. Transaction-level user identity, not just a name (Step 2)
Sales currently carry `cashier_name` and `shift_id` but no stable staff identifier, so per-cashier reporting relies on matching display names — two staff with the same name are indistinguishable and a rename rewrites history.

Database change (one additive migration, plus a matching standalone SQL script for self-hosted installs):
- `sales`: add `cashier_id` (text staff code) and `cashier_user_id` (uuid, the signed-in account), both nullable, backfilled to null.
- `drawer_events` already stores `staff_id`/`staff_name`/`role` — no change.
- Index on `sales (shift_id, cashier_id)` for the reconciliation reads.

Application change: `recordSale` (and the refund/void paths that go through it) stamps both ids from the live session alongside the existing cashier name.

### 3. Reconciliation split by shift vs by cashier (Step 2)
- Drawer/Z-report totals stay keyed on `shift_id` (unchanged).
- The Shifts page gains a per-shift "By cashier" breakdown: each person who transacted on that shift with their sales count, gross takings, refunds and voids, keyed on `cashier_id` with the name as a fallback for older rows.
- The sales report gains a cashier filter driven by the same key.

### 4. Deliberate closure (Step 3)
- Add a final confirmation step to the close dialog ("This ends the shift for everyone on this terminal") so a close is never one tap away from a cash-count typo.
- When the signed-in user lacks `can_close_shift`, offer a supervisor PIN override through the existing manager-gate flow instead of a dead button.
- Unchanged: opener terminal binding, held-bill blocking, mandatory count.

### 5. Audit trail (Step 4)
The shift row already records opener and closer with staff id and role. Add the shift close audit entry to list the distinct cashiers who transacted, so one audit record answers "who opened, who sold, who closed".

## Verification

Walk the four scenarios in the request against the running app: open with a float as manager, lock and sign in as Cashier A (lands on the register, banner shows the opener), sell, lock, sign in as Cashier B, sell, then close and confirm the shift row, the per-cashier breakdown and the audit entry all agree.

## Technical notes

- Files touched: `src/lib/pos-store.tsx` (sale attribution, attach signal), `src/components/pos/ShiftGuard.tsx` (attached banner), `src/routes/index.tsx` (close confirmation + override), `src/routes/shifts.tsx` (per-cashier breakdown), `src/routes/reports.sales.tsx` (cashier filter), `src/lib/pos-db.ts` (new columns mapped both ways), `src/lib/pos-types.ts`.
- New `supabase/sql/29_sale_cashier_identity.sql` mirroring the managed migration, plus the Windows SQL Server offline script.
- No change to PIN verification, session tokens, branch resolution or the offline outbox contract beyond the two new sale fields.
- Patch version bump.
