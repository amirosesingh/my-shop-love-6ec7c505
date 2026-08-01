# Fix: "function gen_salt(unknown) does not exist"

## What is going wrong

The cashier setup script hashes 6-digit PINs using the `pgcrypto` extension (`crypt` / `gen_salt`). On this database, `pgcrypto` is not available in the `public` schema — it lives in a separate `extensions` schema. Every function in `supabase/schema5.sql` is declared with `set search_path = public`, so at run time it cannot see `gen_salt` or `crypt`, and Postgres reports that the function does not exist.

## The fix

Create `supabase/schema6.sql` — a corrected, re-runnable version of the cashier setup that:

- Installs `pgcrypto` into the `extensions` schema, tolerating it already existing.
- Changes every affected function's search path to `public, extensions` so the hashing functions resolve.
- Calls hashing schema-qualified (`extensions.crypt`, `extensions.gen_salt`) as a belt-and-braces measure.
- Re-creates the same objects so nothing is lost: the `cashiers` table, management functions (list / upsert / set permissions / delete / reset PIN), PIN verification, and the migration that moves existing cashiers out of the shared staff table.
- Ends with a schema-cache reload so the app sees the updated functions immediately.

## Technical details

- Affected routines: `upsert_cashier`, `reset_cashier_pin`, `verify_cashier_pin`, plus the migration `DO` block (around lines 138, 147, 207 and 256 of `schema5.sql`).
- Each becomes `security definer ... set search_path = public, extensions`.
- Verification compares `pin_hash = extensions.crypt(p_pin, pin_hash)`.
- The migration block re-checks whether a cashier row already exists before inserting, so applying `schema6.sql` after a partially applied `schema5.sql` is safe.
- No frontend changes needed — `src/lib/pos-cashiers.ts` and `src/lib/pos-auth.tsx` call the same function names with the same signatures.

## After approval

Apply `supabase/schema6.sql` in your database SQL editor, then create a cashier and sign in with the PIN to confirm hashing works.