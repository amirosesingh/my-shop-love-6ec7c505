# Fix: schema10.sql fails on missing `update_updated_at_column()`

## What's happening

`supabase/schema10.sql` creates a trigger on the new `stores` table that calls
`public.update_updated_at_column()`. That helper exists in the Lovable-managed
database, but the POS database (where this script runs) never defines it —
`supabase/schema_final.sql` only defines `is_staff`, not the timestamp helper.
So the script aborts at the trigger with `42883: function ... does not exist`.

## The fix

Make `schema10.sql` self-contained: define the helper inside the script, before
it is used.

- Add near the top of `supabase/schema10.sql`:

```text
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
```

- Keep the rest of the script unchanged; it is already idempotent
  (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `DROP TRIGGER IF EXISTS`),
  so it can be re-run safely after the fix.

`CREATE OR REPLACE` means it is harmless if the function already exists on a
given database.

## Note

`is_staff` is referenced by the new policies and does exist in the POS database
(created by `schema_final.sql`), so no change is needed there.
