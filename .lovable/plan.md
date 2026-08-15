# POS Sync Architecture — Audit Report and Execution Plan

## Phase 1: Audit findings (no files changed)

### 1. Already built and working
- **Single write gateway.** Every till write goes through `dbRouter.write` → `commitOps`, which tries local store first, then the central database, then stops with a visible failure. No cloud call sits on the checkout path.
- **GUID keys everywhere.** All syncable tables (sales, sale_items, products, members, bookings, transfers, adjustments) use UUID text/`uniqueidentifier` ids generated on the terminal, so a replay never duplicates.
- **Local sync flags exist.** The Windows SQL Server schema already carries `is_synced`, `sync_status`, `synced_at`, `sync_error` on every syncable table, plus a `sync_state` key/value table.
- **Atomic local writes.** Local SQL Server operations run inside a transaction per operation; the SQLite mirror uses `BEGIN IMMEDIATE` blocks.
- **Push worker.** Batched push in dependency order, mark-synced on success, park-on-repeat-failure (dead letter), capped exponential backoff with jitter, retry-one and retry-all controls, queue viewer UI.
- **Pull worker.** Catalogue-only pull (stores, tiers, products, promotions, suppliers) merged with server-wins MERGE; transactional tables are never overwritten by the cloud.
- **Secure relay.** `/api/v1/pos/sync` re-verifies caller (session / terminal token / staff token), confirms the branch still exists, and refuses writes outside the caller's branch and permissions. Nothing is written with the service key before that check.
- **Idempotency for sales.** `sales.client_transaction_id` has a unique index, and checkout re-checks it before writing.
- **Offline receipts.** Bill numbers are composed on-device as `BRANCH-PLATFORM+TILL-YYYYMMDD-SEQ`, and printing happens after the local write, with no network dependency.

### 2. Pending / broken
- **Sequence lives in browser storage.** The running bill sequence is kept in `localStorage`, not in the local database. Clearing site data or a profile reset can restart numbering.
- **Attempt counter is in memory only.** Failed-attempt counts live in a worker `Map`; restarting the app resets the dead-letter countdown and no `sync_attempts` / `last_error_at` is persisted per row.
- **One global watermark.** Pull tracks a single `last_pull_at` for all tables instead of per-table high-water marks, so one slow table drags the whole cycle.
- **Batch size** is 200, not the specified 50.
- **No cloud-side sync bookkeeping table.** The central database has no table-level watermark record for what each terminal last pushed/pulled.

### 3. Architectural flaws
- **Absolute inventory overwrite (highest risk).** Product rows carry the whole `stock_by_store` map computed on the terminal. Two branches syncing after an offline spell overwrite each other's quantities — last writer wins. Inventory must move as relative deltas.
- **Direct cloud reads in admin/report screens** (staff manager, item activity drawer, receipt history, sessions) bypass the router. Not on the sale path, but they hard-fail offline instead of degrading.
- **Push idempotency is by primary key only** for non-sale tables; a partially applied batch can re-send rows without a server-side "already applied" guard beyond the key.

### 4. Schema gaps
- Local SQL Server: no `sync_metadata` table; no `sync_attempts`, `last_error_at`, `row_version` columns.
- Cloud: no `sync_metadata` table; no `stock_movements`-based delta application function; `products` has no `row_version` for optimistic locking.

---

## Phase 2: Schema and migrations
- New local script `db/offline/pos-offline-sync-metadata.sql`: creates `dbo.sync_metadata` (`table_name` PK, `last_synced_at` datetime2 UTC, `last_pushed_at`, `rows_pushed`, `last_error`), and adds `sync_attempts INT DEFAULT 0`, `last_error_at DATETIME2`, `row_version INT DEFAULT 0` to every syncable table via an idempotent loop. Mirrored into `electron/db/schema.sql` so fresh installs match.
- Matching SQLite columns added to `electron/db/offline_sqlite_v2.sql` plus a `sync_metadata` table replacing the single kv watermark.
- Cloud migration: `public.sync_metadata` (store_id, terminal_id, table_name, last_synced_at, rows_pushed) with GRANTs and RLS restricted to the caller's own branch, service_role full access; plus `row_version` on `products` and a `stock_apply_delta` security-definer function.

## Phase 3: Offline-first checkout
- Move the bill sequence from `localStorage` into the local database (`sync_state` / SQLite kv), read through the existing bridge, with the browser build keeping the current fallback. Format stays `{Branch}-{Platform}{Till}-{Date}-{Seq}` (a superset of `{StoreId}-{TillId}-{Seq}`).
- Confirm and enforce "local write → print → queue": add a guard so the print call never awaits a network promise, and route the remaining admin/report cloud reads through `dbRouter.query` so they degrade to the local snapshot instead of erroring.

## Phase 4: Two-way sync worker
- Push: batch size 50, ordered by dependency, per-row `sync_attempts` incremented in the database, `last_error`/`last_error_at` persisted, quarantine at the existing threshold.
- Inventory as deltas: sale/adjustment pushes call the new `stock_apply_delta` cloud function (`stock = stock - qty_sold` per branch) instead of pushing an absolute `stock_by_store` map. Delta application is keyed on the movement row id so a retry cannot double-deduct.
- Pull: per-table `last_synced_at` from `sync_metadata`, `UpdatedAt > watermark` query, MERGE upsert into local, watermark written only after a clean merge.
- Failure handling: network dropouts already never block the UI; failures now write `sync_attempts + 1` and `last_error` to the row and a table-level error to `sync_metadata`, with no duplicate risk on retry.

## Security
- Delta and metadata writes go through the authenticated relay only; the new cloud function is security-definer with a caller-branch check, never callable for another branch.
- New tables ship with GRANTs and RLS scoped to the caller's branch; no anon access.
- No token, key or row content is logged; existing refusal logging pattern reused.
- A Supabase linter pass runs after the migration and any finding it raises is fixed in the same change.

## Notes
Phase 2 needs a database migration approval before the Phase 3/4 code can compile against the new columns, so the work lands in that order.
