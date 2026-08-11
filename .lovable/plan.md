# Fix cashier shift opening, access rules, and active-shift continuation

## What is wrong today (verified)

- The database rules on `shifts` require two things at once: the signed-in account must be recognised as staff (`is_staff_now()`, which only reads the `user_roles` table) **and** the shift's branch must match the branch stored on the staff profile (`store_visible()` via `app_users.store_id`).
- A cashier whose profile has **no branch assigned** fails that branch test (an empty profile branch compares as "unknown", not "allowed"), and a cashier with no row in `user_roles` fails the staff test. Either one silently refuses the insert and the follow-up read, which is what produces "shift was not found in the database after saving" and permission errors.
- Opening a shift is currently a plain table write followed by a separate read-back, so both steps have to pass the rules independently.
- Continuation already partly works: the register reads the branch's open shift and, when one exists, the lock screen never appears. What is missing is (a) it fails for cashiers because of the rules above and (b) there is no "continuing active shift" confirmation.

## Step 1 — Branch and staff rules on shifts

New SQL file `supabase/sql/29_shift_access_and_rpcs.sql` (plus the same change applied to the cloud database):

- Treat a staff member with **no branch on their profile** as allowed on the terminal's branch instead of denied, and keep everyone else pinned to their own branch. Supervisors and admins keep full visibility.
- Recognise staff from `app_users.role`/`role_slug` as well as `user_roles`, so accounts created through the staff screen are staff even when the role row is missing.
- Re-create read / create / update rules on `shifts` and `shift_sessions` on top of the corrected helpers, with the matching table grants.

## Step 2 — Server routines for opening and finding a shift

Same SQL file:

- `shift_open(...)` — creates the shift and **returns the complete new row**, so the till never needs a second restricted query. If the caller's profile has no branch, it falls back to the branch passed by the terminal. Refuses if a shift is already open for that branch and returns the existing one instead, so two tills cannot double-open.
- `shift_active_for_branch(branch)` — returns the branch's open shift as a full row.
- Both run with elevated rights but only for signed-in staff, and both are blocked for visitors.

## Step 3 — Register wiring

- `src/lib/pos-db.ts`: `commitShift` for a *new* shift calls `shift_open` and returns the stored row; `loadActiveShift` calls `shift_active_for_branch` first and keeps today's relay and offline-queue fallbacks untouched. Closing a shift keeps the existing update path.
- `src/lib/pos-store.tsx`: use the row returned by the open call as the active shift (drops the fragile read-back check), and when a login lands on a shift that was already open, show a one-time toast "Continuing active shift opened at <branch>". No modal, no interruption — the cashier goes straight to the register.
- `src/components/pos/ShiftGuard.tsx`: unchanged behaviour, minus the misleading permission wording when the failure was a branch mismatch.

## Verification

- Query the rules and helpers back from the database after the change.
- Sign in as an admin, open a shift with a float, then re-check the same branch read as a cashier-shaped account and confirm the row is visible.
- Confirm a second sign-in on the open shift skips the open-shift panel and shows the continuation notice, and that closing then re-opening works cleanly.

## Technical notes

- Nothing is opened to anonymous callers; the relaxation is limited to staff whose profile has no branch, who are scoped to the terminal's registered branch.
- The offline outbox path is untouched: when the terminal cannot reach the database, the shift is still queued locally exactly as today.
