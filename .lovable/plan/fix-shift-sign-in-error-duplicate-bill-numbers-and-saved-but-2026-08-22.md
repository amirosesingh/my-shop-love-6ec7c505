# Fix: shift sign-in error, duplicate bill numbers, and "saved but shown as failed"

Three separate faults are behind what you are seeing. All three are confirmed in the code.

## 1. "Saving shift sign-in failed. Unknown table: shift_sessions"

The table exists in the shop's SQL Server script (`db/offline/pos-offline-sqlserver.sql`) and in
the SQLite mirror, but the till's local write layer keeps a whitelist of tables it is allowed to
write, and `shift_sessions` (and `drawer_events`) are not on it — so every sign-in write is
rejected before it reaches the database.

Fix:
- Add `shift_sessions` and `drawer_events` to the allowed-table list in `electron/db/repo.cjs`
  and to the mirrored-table list in `electron/db/sqlite.cjs`.
- Make a sign-in log write non-fatal: if the table is still missing on an older till, it is
  recorded in diagnostics instead of throwing a red error at the cashier. Sign-in visibility must
  never block trading.

## 2. The same bill number is reused after a failed payment

The bill number is reserved the moment the first item is scanned and is stored with the ticket
draft. When a payment fails, the cart (and its number) is deliberately kept — but the retry then
tries to store the *same* number, and because bill numbers are unique the second attempt is
refused with a bill error.

Fix:
- On retry, if the database refuses the bill because that number already exists, the till first
  asks "was this exact checkout attempt already stored?". If yes, the sale is treated as complete
  (receipt printed, cart cleared) instead of being billed twice.
- If it was not stored, a fresh bill number is minted automatically and the sale goes through —
  no manual intervention, no duplicate.

## 3. The bill is saved but the screen says it failed

A checkout writes several records (bill, bill lines, tenders, movements, stock, member points)
one after another. If the bill lands and a later record fails, the whole checkout is reported as
failed even though the bill is in the database — which is why the sale is missing from the bill
list on screen but present in the data.

Fix:
- After any checkout failure, the till re-checks whether the bill itself reached the central
  database using the attempt id. If it did, the remaining records are re-sent in the background
  as idempotent writes (keyed on their own ids, so nothing can double up) and the cashier sees a
  normal completed sale.
- The checkout attempt id becomes stable for the ticket instead of being regenerated on every
  press, so a double click or a network drop can never create two bills.

## Technical notes

- `electron/db/repo.cjs` `TABLES`, `electron/db/sqlite.cjs` `SYNCED_TABLES`: add
  `shift_sessions`, `drawer_events`.
- `src/lib/shift-sessions.ts`: sign-in/sign-out writes become best-effort.
- `src/lib/pos-db.ts`: new duplicate-bill detector; `commitSale` recovers a partial commit by
  re-checking `saleAttemptExists` and replaying the remaining operations as upserts.
- `src/lib/pos-store.tsx` `recordSale`: accepts a caller-supplied attempt id; retries once with a
  fresh bill number on a duplicate-number refusal.
- `src/lib/register/use-checkout.ts`: keeps one attempt id per ticket, cleared only on success.
- Tests: duplicate bill-number retry, partial-commit recovery, shift-session write on a till
  without the table.
- Version bump on completion.
