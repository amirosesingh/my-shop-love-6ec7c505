# One consolidated database script (with working PIN hashing)

## Where hashing actually happens

Hashing is never done in the React app. It happens inside the database functions, using the `pgcrypto` extension:

- Saving a cashier: `upsert_cashier` stores `extensions.crypt(pin, extensions.gen_salt('bf'))`
- Logging in: `verify_cashier_pin` re-hashes the typed PIN using the stored hash as salt and compares
- Same pattern for terminal users in `upsert_terminal_user` / `verify_terminal_pin`

So if those functions are missing from the live database, nothing is doing the hashing — that is exactly the "function is missing" symptom.

## What is missing today

The app calls 12 database functions, but they are spread across five scripts written at different times that partly overwrite each other:

- `schema.sql` / `schema2.sql` / `schema3.sql`: `list_app_users`, `current_app_user`, `verify_terminal_pin`, `set_app_user_permissions`, `set_app_user_profile`, `upsert_terminal_user`, `delete_terminal_user` — three competing versions
- `schema5.sql`: `list_cashiers`, `upsert_cashier`, `set_cashier_permissions`, `delete_cashier`, `verify_cashier_pin`
- `schema4.sql`: only the auth sync trigger

Running them in the wrong order leaves some functions old and some absent.

## Plan

1. Create a single `supabase/schema_final.sql` that fully replaces schemas 1-5:
   - Preflight that installs `pgcrypto` into the `extensions` schema and raises a clear error if it cannot, instead of silently swallowing it.
   - All POS tables plus `app_users`, `cashiers`, `user_roles`, idempotent and additive so existing data survives.
   - All 12 functions the frontend calls, each recreated as `security definer` with `set search_path = public, extensions`, and every hashing call written as `extensions.crypt(...)` / `extensions.gen_salt(...)` with explicit `::text` casts.
   - Grants on the tables and `execute` grants on the functions.
   - A self-check block at the end that raises an error listing any of the 12 functions that did not get created, then reloads the API schema cache.
2. Add a header comment marking this as the only script to run; older schema files stay in the repo for history but are superseded.
3. No frontend changes needed — the RPC names and arguments already match.

## Technical notes

- Functions guaranteed: `list_app_users`, `current_app_user`, `verify_terminal_pin`, `set_app_user_permissions`, `set_app_user_profile`, `upsert_terminal_user`, `delete_terminal_user`, `list_cashiers`, `upsert_cashier`, `set_cashier_permissions`, `delete_cashier`, `verify_cashier_pin`.
- Old overloads are dropped by signature before recreation, so stale versions containing unqualified `gen_salt` cannot survive.
- Confirmed in the connected database that `pgcrypto` lives in the `extensions` schema, which is why unqualified `gen_salt(...)` fails and qualified calls are required.