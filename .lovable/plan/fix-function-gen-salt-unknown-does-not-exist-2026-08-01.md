# Fix: "function gen_salt(unknown) does not exist"

## What is going wrong

The cashier setup script hashes 6-digit PINs using the `pgcrypto` extension (`crypt` / `gen_salt`). On this database, `pgcrypto` is not available in the `public` schema — it lives in a separate `extensions` schema. Every function in `supabase/schema5.sql` is declared with `set search_path = public`, so at run time it cannot see `gen_salt` or `crypt`, and Postgres reports that the function does not exist.

## The fix

Fix the hashing calls in place, across every SQL script that uses them, so they work with `pgcrypto` in the `extensions` schema:

- `supabase/schema5.sql` (cashiers), `supabase/schema3.sql`, `supabase/schema2.sql`, `supabase/schema.sql`, `supabase/external-setup.sql`.
- Ensure `pgcrypto` is installed into the `extensions` schema, tolerating it already existing elsewhere.
- Every function that hashes or verifies gets `set search_path = public, extensions`.
- Every hashing call is schema-qualified: `extensions.crypt(...)`, `extensions.gen_salt('bf')`.
- All scripts stay idempotent and fully re-runnable (`create ... if not exists`, `create or replace function`, guarded `DO` blocks).
- Each script ends with a schema-cache reload so the app picks up the updated functions immediately.

## Technical details

- Affected routines include `upsert_cashier`, `reset_cashier_pin`, `verify_cashier_pin`, and the cashier migration `DO` block in `schema5.sql`, plus the equivalent PIN/hash routines in the older scripts.
- Each becomes `security definer ... set search_path = public, extensions`.
- Verification compares `pin_hash = extensions.crypt(p_pin, pin_hash)`.
- Migration blocks re-check existing rows before inserting, so re-running after a partial apply is safe.
- No frontend changes needed — `src/lib/pos-cashiers.ts` and `src/lib/pos-auth.tsx` call the same function names with the same signatures.

## After approval

Apply the updated `supabase/schema5.sql` in your database SQL editor, then create a cashier and sign in with the PIN to confirm hashing works.