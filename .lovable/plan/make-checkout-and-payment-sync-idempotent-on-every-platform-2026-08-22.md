# Make checkout and payment sync idempotent on every platform

## Goal
A completed checkout must produce exactly one sale, one stable set of lines and tenders, and one stock movement set whether it is saved online, offline, retried, or recovered after a partial network failure.

## Confirmed causes
- Central checkout writes are sequential rather than atomic: `sales` can succeed before `sale_items`, `payment_transactions`, or activity rows fail.
- The cashier/terminal relay preserves queued `insert` operations as plain inserts. Retrying a row that already landed therefore raises a unique-key error, unlike the direct client path, which already upgrades keyed inserts to upserts.
- Current recovery treats an existing sale header as a completed checkout and sends missing child rows through a best-effort background path. A second failure can leave the sale without payment/items while the till clears the ticket.
- The stable checkout attempt ID is correct for the normal payment screen, but an existing sale header currently causes an early return before completeness is checked.
- Electron SQL Server stores each local table operation transactionally, but a whole checkout is sent as several operations. Its worker pushes table-by-table, so parent and child rows can still reach the central database in different cycles.
- Electron's worker upserts by row ID, but the web relay does not provide the same idempotent behavior. This creates platform-dependent retry results.
- Android is live-only and has no offline transaction queue; browser operational writes also require the central database. Electron is the only platform with durable SQL fallback.
- Removing the final cart line leaves the reserved bill number attached to the empty ticket, allowing an unrelated next ticket to reuse that reservation.
- The observed telemetry 401 is a separate branch-telemetry permission issue; it is not the payment duplicate-key cause.

## Changes

### 1. Make relay retries idempotent
- Convert relay `insert` operations to upserts on `id` whenever every row has a stable client-generated ID, matching the existing direct client behavior.
- Define a server-owned conflict-key allow-list per table; do not accept arbitrary conflict columns from clients.
- Return duplicate/replay outcomes as successful idempotent acknowledgements when the same row ID is already present.

### 2. Recover the complete sale, not only its header
- Build the sale header, item rows, tender rows, activity rows, product changes, and member change once, with stable IDs derived from the checkout attempt/sale and reused for every retry.
- Replace the early `saleAttemptExists => success` return with a recovery flow that obtains the stored sale ID and upserts all expected child rows before reporting completion.
- Await recovery of financially essential rows: sale header, sale items, and payment transactions. Do not clear the cart or print a final receipt until these are confirmed in either the central database or Electron's durable local database.
- Keep stock application separately retryable through its existing movement-ID ledger so retries cannot deduct stock twice.
- Treat optional audit/visibility writes as non-blocking, but record their failure in diagnostics.

### 3. Keep one deterministic identity across retries
- Preserve one `client_transaction_id` for the ticket until the full sale is confirmed.
- Preserve the sale ID, payment IDs, line IDs, and movement IDs across retry/restart instead of regenerating them.
- Give exchange checkout the same stable attempt-ID handling as normal checkout.
- Clear the attempt and reserved bill number only after confirmed completion or an explicit cart reset/void.
- When removing the final cart line, reset the empty ticket's reservation so the next ticket receives a new bill number.

### 4. Make Electron checkout durable as one unit
- Add a batch/transaction IPC operation so SQL Server saves all sale-related operations in one database transaction rather than one transaction per table operation.
- Queue the same stable rows for cloud replay and retain parent-before-child ordering.
- Make the worker interpret an already-present row with the same ID as synced, not quarantined.
- Keep failed children pending independently; never mark a sale fully synchronized while required items or tenders remain failed.
- Apply equivalent stable-ID/upsert behavior to the SQLite queue used by the Electron shell.

### 5. Align platform behavior
- Web: central save must confirm required sale rows; no claim of offline save because browser storage is intentionally not durable for sales.
- Android: retain live-only behavior, but use the same atomic/idempotent central sale contract and keep the ticket intact on failure.
- Electron: central-first when available, transactional local SQL fallback when offline, then idempotent background replay.
- Surface a clear status distinction between `Saved`, `Saved locally — pending sync`, and `Partially synced — retrying`; do not show a generic payment failure when the sale is already recoverable.

### 6. Database contract and repair migration
- Add one central database function that accepts the complete checkout payload and performs sale, lines, tenders, and required ledger inserts in one transaction, using `client_transaction_id` as the checkout idempotency key.
- On repeated calls, return the existing sale and reconcile missing child rows rather than raising a unique violation.
- Keep primary-key uniqueness on payment and line IDs; no second mutable payment idempotency key is required once IDs are stable and generated once.
- Add a repair query/report for existing sale headers that have zero items or zero payment rows, so historical partial commits can be identified and recovered safely.
- Include required grants and preserve branch/role enforcement in the authenticated server contract.

## Verification
- Normal cash, card, bank transfer, points, and split-tender checkout on web, Android, and Electron.
- Network loss after each boundary: before header, after header, after lines, after payments, and after activity rows.
- Retry the same checkout multiple times and assert exactly one sale, expected line count, expected tender count, and one application per stock movement ID.
- Electron offline sale, restart, reconnect, and replay without duplicate-key errors or quarantined payment rows.
- Cashier relay and signed-in staff direct path produce identical results.
- Exchange retry uses one attempt identity and cannot create duplicate sales.
- Removing the last cart line causes the next ticket to reserve a fresh bill number.
- Existing partial-sale repair reports only genuinely incomplete transactions.

## Technical order
1. Central atomic checkout function and migration.
2. Relay idempotency and conflict-key validation.
3. Stable checkout payload and awaited recovery in `pos-db.ts` / checkout state.
4. Electron batch transaction and worker replay handling.
5. Cart reservation reset and exchange attempt identity.
6. Focused unit, integration, and Electron restart/reconnect tests; then version bump.
