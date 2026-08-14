# Schema v2 remediation — dual failover, SQL-only local store, ledger integrity (build 1.3.1)

Scope agreed: Electron is the only place with a local SQL engine. The browser build
becomes cloud-only (no queue, no snapshot). This pass covers Phase 1 and Phase 2;
optimistic locking and dead-letter handling follow in a second pass.

## Reconnaissance findings

- `electron/db/sqlite.cjs` falls back to a plain JSON file (`local_pos_database.json`)
  whenever `node:sqlite` fails, and every function has a JSON branch. It also writes
  without explicit transactions.
- `electron/db/offline_sqlite_v2.sql` already sets `foreign_keys`, `journal_mode` and
  `synchronous`, but not `busy_timeout`.
- The browser keeps a write queue in `localStorage` (`pos.sync.outbox`) and a full data
  snapshot (`pos.offline.snapshot.v1`).
- `product_barcodes`, `payment_transactions`, `item_activity_logs` and
  `offline_sync_audit_log` exist in the cloud database but no application code reads or
  writes them. Barcode lookup (`src/lib/product-lookup.ts`) still scans in-memory arrays
  built from `products.barcode_aliases` / `barcode_variants`.
- Manager approval is already verified server-side against a hashed PIN
  (`verify_terminal_pin` / relay), so no plaintext check exists to remove.
- Sync retry backoff is `attempts² × 5s` with no cap and no dead-letter state.

## Failover architecture

One decision point per operation, in `src/lib/db-router.ts`:

```text
WRITE                                  READ
 ├─ desktop: local SQLite (atomic)      ├─ cloud reachable → cloud
 │    └─ queue cloud op in              └─ cloud down (desktop) → local SQLite
 │       offline_sync_queue
 ├─ local engine down → cloud direct
 ├─ cloud down (desktop) → local only
 └─ both down → halt + modal, nothing lost silently
```

Web build: cloud only. If the cloud is unreachable the action stops with the existing
"Database Connection Required" modal instead of writing to browser storage.

## Phase 1 — local engine hardening and failover

1. `electron/db/sqlite.cjs`: delete the JSON store entirely (`loadJson`, `saveJson`, all
   `json.*` branches, the `json` engine result). If SQLite cannot open, `init` returns
   `{ ok: false }` and the app treats the local engine as absent, falling over to cloud.
2. Add `PRAGMA busy_timeout = 5000` to `offline_sqlite_v2.sql`; wrap every multi-statement
   write (mirror, enqueue, mark, audit trim) in `BEGIN IMMEDIATE … COMMIT` with rollback
   on error.
3. Remove browser fallback storage: `src/lib/sync-outbox.ts` and
   `src/lib/offline-snapshot.ts` become no-ops outside Electron; `src/lib/pos-db.ts`
   routes non-desktop writes straight to cloud-or-halt.
4. `src/lib/db-router.ts` gains explicit `localAvailable()` / `cloudAvailable()` checks
   driven by `connection-health`, and applies the routing table above to every read and
   write, not only operational tables.

## Phase 2 — barcode index, payment ledger, oversell and activity log

5. Backfill migration (cloud): populate `product_barcodes` from `products.barcode`,
   `barcode_aliases` and `barcode_variants` (dedup, primary flag), and populate
   `payment_transactions` from `sales.payments` JSON and `booking_payments`. Read-only
   verification counts run before the query paths switch over.
6. `src/lib/product-lookup.ts`: `resolveByBarcode` resolves through an indexed
   `product_barcodes` lookup (SQL locally, Data API in the cloud) with the current
   in-memory scan kept only as an in-session cache.
7. Checkout, refund and booking deposit paths write a `payment_transactions` row in the
   same operation group as the sale/booking, so the ledger can never drift. Booking
   deposits are validated against `deposit_amount <= total_amount`.
8. Oversell guard: before a line is added or increased, stock is checked; a resulting
   negative balance blocks the line unless the existing manager gate authorises it
   (server-side hashed PIN — unchanged).
9. Every sale, void, refund and adjustment writes an `item_activity_logs` row
   (`activity_type`, `quantity_delta`, `stock_before`, `stock_after`) in the same atomic
   group.

## Deferred to the next pass (Phase 3)

`row_version` optimistic locking on `products` / `members` / `bookings`, capped
exponential backoff (`min(30s, 2^n·1s + jitter)`), 10-attempt dead-letter status, and
Data Sync Hub manual retry / discard-with-compensating-rollback.

## Version

Bump to **1.3.1** via `scripts/bump-version.cjs --write`; header chip and
Settings → Updates read `APP_VERSION` and update automatically.

## Remaining flaws after this pass

Documented in `docs/architecture-audit-v2.md`: no conflict versioning until Phase 3,
unbounded retries until Phase 3, web build loses all offline tolerance by design, and
`sales.payments` JSON remains as a historical column (ledger becomes the read path).
