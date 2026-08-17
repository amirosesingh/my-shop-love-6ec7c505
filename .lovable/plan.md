# Fix the "relation public.cashiers does not exist" error in supabase/schema.sql

## What is happening

The file creates its 77 routines before it creates the tables. That is fine for the
plpgsql routines — Postgres does not look inside their body at creation time — but 25 of
them are plain SQL routines, and for those Postgres validates every table reference the
moment the routine is created. `legacy_cashiers_for_migration()` reads `public.cashiers`,
and on a fresh project that table does not exist yet, so the run stops at that line.

Two tables (`coupon_campaigns` and `shifts`) sit in the middle of the routine block for
the same reason in reverse: three routines take those row types as a parameter or return
type, so those tables have to exist first.

## The fix

1. Add one session setting near the top, next to `statement_timeout`:
   `SET check_function_bodies = off;`
   This tells Postgres to skip the body check while the script runs, exactly as a database
   restore does. It affects only the current editor session, changes nothing about how the
   routines behave afterwards, and is the same setting Postgres' own dump files use.

2. Reorder the script so it is correct on its own merit, not just tolerated:

```text
extensions -> enums -> ALL tables -> column top-up -> routines
  -> constraints -> indexes -> views -> triggers -> grants
  -> RLS + policies -> verification
```

   The routine block moves down to sit after the column top-up. `coupon_campaigns` and
   `shifts` move up into the main table block with the other 50 tables, so the three
   routines that depend on their row types still find them.

3. Update the "Order:" comment in the file header to match the new sequence.

No SQL text inside any table, routine, policy or grant changes — this is purely the order
statements run in, plus the one new `SET`. The file stays additive and re-runnable, and
still works both on an empty project and on the live database.

## Verification

Run the reordered file top to bottom against a scratch Postgres database twice: the first
run must complete with no error, the second must be a no-op, and the closing verification
query must return no rows.