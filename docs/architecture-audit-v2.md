# Architecture Audit — Schema v2 (build 1.3.0)

## 1. Critical architectural flaws

- **No SQLite pragmas.** `electron/db/sqlite.cjs` opened `local_pos_database.db` with no `foreign_keys`, `journal_mode` or `synchronous` setting: writes were unprotected against power loss and referential integrity was never enforced. Fixed in `offline_sqlite_v2.sql`.
- **Blob-only local store.** Everything offline lived in one `mirror(entity, id, payload)` table, so every lookup was a full scan + `JSON.parse`, and no local constraint could catch a bad row. v2 adds typed, indexed mirrors for the hot entities.
- **Silent JSON fallback.** When `node:sqlite` is unavailable the engine falls back to a plain JSON file with no atomic write and a swallowed `catch` on disk-full. The fallback still exists (the till must sell), but it is now the only untyped path and should surface a visible degraded-mode banner.
- **Unindexed hot lookups.** `products.barcode`, `products.sku`, `members.phone`, `bookings.ref` and `sales.bill_number` had no index in the cloud database; scan time grew linearly with catalogue size. Indexes added.
- **Multi-barcode stored as JSON/array.** Alias lookups could not use an index and could not enforce global uniqueness — two products could claim the same barcode. `product_barcodes` now enforces `UNIQUE (barcode)`.
- **No unified payment ledger.** Sale tenders live in `sales.payments` (JSON) and booking money in `booking_payments`; nothing reconciled the two, so partial settlements spanning both were invisible to reporting. `payment_transactions` closes this.
- **Fragmented inventory audit.** `stock_adjustments`, `activity_events` and `audit_logs` each hold part of the story; `item_activity_logs` gives one per-product timeline.

## 2. Missing logic and edge cases

- **Negative stock** is representable everywhere; nothing blocks or flags a sale that drives `stock_quantity` below zero, and no oversell alert is raised.
- **Concurrent offline edits** have no version column or vector clock. Two terminals editing the same product both push and last-writer-wins silently.
- **Void/refund reversals** do not write a compensating inventory movement, so stock and audit drift after a refund.
- **Sync retries** increment `attempts` with no cap and no backoff — a permanently-rejected row retries forever and starves the queue.
- **Queue rows are never dead-lettered**; a poisoned payload blocks visibility of healthy pending work.
- **Deposits on bookings** are not validated against the total, so an overpaid deposit can produce a negative balance due.

## 3. Recommended fixes, in order

1. Add an oversell guard in the cart: block (or manager-PIN gate) any line that would push store stock below zero, and log an `item_activity_logs` row with `activity_type = 'sale'` and the resulting balance.
2. Add `row_version integer` (or `updated_at` compare-and-set) to `products`, `members` and `bookings`; reject a queued UPDATE whose base version is stale and surface it as a conflict in the Data Sync Hub.
3. On void/refund, write the reversing `item_activity_logs` and `payment_transactions` rows in the same transaction as the sale update.
4. Cap `offline_sync_queue.attempts` at 10, apply exponential backoff, and move exhausted rows to `status = 'failed'` with the last `error_message` shown in the Sync Hub for manual retry or discard.
5. Backfill `product_barcodes` from `barcode_variants` (the array aliases are already migrated) and switch `resolveByBarcode` to query the indexed table.
6. Start writing `payment_transactions` on every tender and booking payment, then make reports read the ledger instead of parsing `sales.payments`.
7. Surface a persistent "degraded local storage" banner whenever the local engine reports `json` instead of `sqlite`.
