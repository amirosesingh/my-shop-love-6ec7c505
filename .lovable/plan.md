# Staff creation fix, flexible PIN length, and offline write idempotency

## Diagnostic results

I scanned the staff provisioning path (`staff-admin.server.ts`, `staff-admin.ts`, `pos-auth.tsx`, `StaffManager.tsx`) and the database.

- **No code path inserts into `app_users` directly.** Creation goes: admin UI to server function to the Auth Admin API to the database routine `staff_account_upsert`, which inserts without naming `id` and relies on the column default.
- **In the Lovable-managed database `app_users.id` already defaults to a generated UUID**, so the null-id error cannot come from there. The POS app writes to a separate, self-hosted store database (configured through `external-supabase-config`), and that copy is where the `id` column is missing its default — it was created by an older script. That is the likely cause of `23502 null value in column "id"`, and it stays unconfirmed until the SQL below runs there.
- Dual-email routing is already correct: a plain username becomes `name@pos-internal.local` and is confirmed immediately; a real address stays as typed and waits for its confirmation email. Branch, role slug and PIN length are already sent on every call.
- The terminal keypad, staff/roles tabs, deactivated-account message, 3-minute idle lock and 5-attempt/5-minute PIN lockout are already implemented.
- The offline queue does not yet carry an idempotency key, so a retry over a weak connection can duplicate a sale or shift.

## What will change

### 1. Repair the store database
A new script `supabase/sql/27_app_users_id_default.sql`, safe to re-run:
- give `app_users.id` (and any other staff table missing one) a generated-UUID default and backfill nulls
- allow credentials of 4 to 32 characters instead of exactly 4-6 digits, in `staff_account_upsert` and `staff_account_set_pin`, still stored as a bcrypt hash
- widen `pin_length` handling accordingly

It is added to the `26_staff_upgrade_22_25` runner and the SQL README so a fresh install picks it up.

### 2. Flexible masked credential
- The credential field in `StaffManager.tsx` stays masked, drops the 6-character cap and the digits-only filter, and accepts 4-32 characters of any kind.
- Validation wording follows suit: "4 to 32 characters"; email accounts still require 8 or more.
- The actual typed length is sent as `pin_length`.

### 3. Terminal keypad for variable-length credentials
- The dot row grows to the stored length; auto-submit still fires when the last expected character lands.
- Accounts whose credential is not digit-only get a masked text field with an explicit Enter, while digit accounts keep the touch keypad.
- `verify_terminal_pin` already compares by hash, so it accepts longer values unchanged.

### 4. Offline queue idempotency
- Each queued entry's existing local id is carried as `temp_id` on sales, shifts, drawer events and stock movements.
- The sync engine upserts on that key with merge-duplicates, so a retry updates the same row instead of creating a second one. Replay order and storage keys are untouched.
- The nullable `temp_id` column plus its unique index is included in the same SQL script.

## Technical notes

- Files touched: `supabase/sql/27_app_users_id_default.sql` (new), `supabase/sql/26_staff_upgrade_22_25.sql`, `supabase/sql/README.md`, `src/components/admin/StaffManager.tsx`, `src/lib/staff-admin.ts`, `src/lib/staff-admin.server.ts`, `src/components/auth/CashierPinLogin.tsx`, `src/lib/sync-outbox.ts`, `src/lib/sync-engine.ts`.
- No change to the authentication model: every operator keeps a real backend account; the PIN is that account's password.
- Legacy cashier forms are already gone from the staff route; only the two tabs remain.
- Verification: typecheck, the existing security and sync tests, and a browser pass over the staff page and terminal keypad. The null-id error itself can only be confirmed fixed after the new SQL runs against the store database.