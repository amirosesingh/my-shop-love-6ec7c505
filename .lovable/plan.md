# Fix cashier PIN hashing resolution

## Confirmed state

- `pgcrypto` is installed in the `extensions` schema.
- The database exposes `extensions.gen_salt(text)`, `extensions.gen_salt(text, integer)`, and `extensions.crypt(text, text)`.
- A direct live call to `extensions.gen_salt('bf'::text)` and `extensions.crypt(...)` succeeds.
- The current `schema5.sql` already qualifies its visible hashing calls, so the reported unqualified `gen_salt(unknown)` error is coming from a stale or separately selected SQL statement, or from an older stored definition.

## Changes

1. Replace the exception-swallowing extension setup in `schema5.sql` with an explicit, idempotent preflight that verifies `pgcrypto` exists in `extensions` and raises a useful error if it does not.
2. Add explicit `::text` casts to every bcrypt algorithm, PIN, and salt argument so PostgreSQL never has to resolve an `unknown` literal.
3. Set the search path on every PL/pgSQL block/function involved in cashier hashing and migration, while retaining explicit `extensions.crypt(...)` and `extensions.gen_salt(...)` calls.
4. Recreate the cashier RPCs idempotently so any older stored function bodies are replaced, then reload the API schema cache.
5. Validate the final script against the live database with direct hash generation and verification checks, and confirm the stored RPC definitions contain no unqualified hashing calls.

## Result

`schema5.sql` will be fully re-runnable and cashier creation/login will consistently resolve the hashing functions from the `extensions` schema.