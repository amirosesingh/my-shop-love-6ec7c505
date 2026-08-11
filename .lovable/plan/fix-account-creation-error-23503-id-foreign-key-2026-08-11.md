# Fix account creation error 23503 (id foreign key)

## What the error means

Creating a staff account fails with:

`insert or update on table "app_users" violates foreign key constraint "app_users_id_fkey" — Key (id) is not present in table`

I checked the constraints on `app_users` in the Lovable-managed database: it only has the primary key and the username unique key — no such foreign key. So this constraint exists only in your own store database, created by an older script where the staff row's `id` had to be the *same value* as the sign-in account's id.

The previous fix gave `id` a randomly generated default. On your store database that random value has no matching sign-in account, so the old foreign key rejects it. This matches the error text and the managed-database check, and will be fully confirmed when the query below runs against the store database.

## The fix

### 1. New script `supabase/sql/28_app_users_id_link.sql` (safe to re-run)

- Detect any foreign key on `app_users.id` and drop it. `id` becomes a plain primary key again, exactly as in the managed database. The link to the sign-in account stays in the existing `auth_user_id` column, which is what all current code reads.
- Keep the generated-uuid default and the not-null rule.
- Include a verification query listing the remaining constraints so the result is visible after running.

### 2. Make the account routine resilient either way

Rewrite `staff_account_upsert` so a new row uses the sign-in account's id when one is supplied and falls back to a generated id otherwise. Creation then succeeds on a repaired database and on one that still carries the old link.

### 3. Keep the runner and docs in step

- Add script 28 to `supabase/sql/26_staff_upgrade_22_25.sql`.
- Note the new script and its purpose in `supabase/sql/README.md`.
- Apply the same change to the managed database through one migration so both behave identically.

## Verification

- Run the upgrade runner against the store database; confirm the verification query shows no foreign key on `id`.
- Create a username/PIN account and an email/password account from the Accounts tab.
- Edit an existing account and change its credential; confirm it persists after reload.
- Sign in at the terminal with the new PIN account.

## Technical scope

- New: `supabase/sql/28_app_users_id_link.sql`.
- Edited: `supabase/sql/26_staff_upgrade_22_25.sql`, `supabase/sql/README.md`, plus one Lovable Cloud migration with the same SQL.
- No frontend changes needed; `staff-admin.server.ts` already sends the sign-in account id on every call.