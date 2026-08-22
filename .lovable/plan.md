# Electron Offline & Sync Hardening — Confirmed-Findings Fix

## What the deep scan confirmed (code + live cloud)

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 1 | **Cloud `payment_transactions` has no `client_transaction_id` column** | live `information_schema` query: column absent | Electron pushes include this column (local table has it) → PostgREST rejects the batch → **payments from the till never sync**, which is the exact "sale lands but payment fails → duplicate key / stuck bill" loop reported |
| 2 | **Local MSSQL `sales` table lacks `client_transaction_id`** | `db/offline/pos-offline-sqlserver.sql` vs cloud | Offline-saved sales silently drop the idempotency key (`upsertRow` filters to known columns) → no duplicate-sale recovery for Electron-originated sales |
| 3 | **Local `bookings` / `shifts` / `products` schemas lag the cloud badly** | column diff: bookings missing 20+ racket-service columns (`job_status`, `ref`, `string_type`, `tension_*`…), shifts missing the whole X/Z-report column set, products missing `is_archived` | Offline racket intake and shift-close data is **silently discarded** on local save; archived products stay sellable offline |
| 4 | **`transfers` table is pushed but does not exist in the cloud** | `repo.TABLES`/`PRUNABLE_TABLES` vs live schema | Any legacy local `transfers` row fails every push cycle forever (404) |
| 5 | **Quarantine counters live only in memory** | `worker.cjs:27` `const attempts = new Map()` resets on boot; persisted `sync_attempts` column is written but never read back | "Parked" rows unpark on every app restart and hammer the cloud again |
| 6 | **Stock-delta refusals are marked "synced"** | `worker.cjs` fallback path: `markSynced` even when cloud refuses; only the last error reaches logs | Negative-stock guard refusals are invisible to operators |
| 7 | **SQLite offline queue is dead code** | `local:enqueue`/`local:pending`/`local:mark` IPC have zero renderer callers; only `local:rollback` is used | SyncHub shows always-zero pending counts — misleading about real queue state |

## Fix plan

### 1. Schema drift repair (root cause of unsynced payments)
- **Cloud migration**: add `payment_transactions.client_transaction_id uuid NULL` + unique index (matches the stable-child-ID design so payment retries are idempotent centrally).
- **Local MSSQL migration** (`db/offline/migrations/…`, guarded `IF COL_LENGTH IS NULL … ALTER TABLE`):
  - `sales.client_transaction_id`
  - `bookings`: racket-service columns (`ref`, `job_status`, `job_status_at/by`, `service_type_id`, `string_type`, `tension_main/cross/unit`, `technician`, `grip_product_id`, `intake_note`, `liability_accepted`, `promised_at`, `notify_whatsapp`, `payment_timing`, etc.)
  - `shifts`: X/Z-report columns (`expected_*`, `counted_*`, `variance_*`, `closing_float`, `status`, `opened_by_*`, `closed_by_*`, `terminal_id`, `terminal_name`)
  - `products.is_archived` / `archived_at`, `members.is_verified` / `verified_at` / `verified_channel`
  - Mirror the same additive columns in `electron/db/migrations/` (SQLite) where applicable.
- **Push whitelist**: add a `CLOUD_COLUMNS` map in `repo.cjs`; `toCloudRow` emits only centrally-known columns per table and logs dropped extras once per table — schema drift becomes non-fatal permanently instead of killing whole batches.
- Remove legacy `transfers` from `repo.TABLES` / `PRUNABLE_TABLES` / `JSON_COLUMNS` push paths (modern flow uses `stock_transfers`).

### 2. Durable quarantine
- `markFailed`: compute quarantine in SQL — when `sync_attempts` reaches the cap, persist `sync_status='quarantined'`.
- Worker: delete the in-memory `attempts` Map; `pendingRows`/`housekeep` already select persisted counters, and "Retry all errors" resets quarantined rows. Parked rows stay parked across restarts.

### 3. Stock-delta refusal visibility
- `applyStockDeltas`: return per-delta results; refused deltas mark their movement rows `sync_status='error'` with the guard's reason (not `synced`).
- SyncHub: show refused/error counts and the last refusal reason per store so operators can see and act on rejected stock movements.

### 4. Dead SQLite outbox cleanup + honest sync UI
- Remove the orphaned `local:enqueue` / `local:pending` / `local:mark` IPC handlers and dead queue functions in `sqlite.cjs` (keep `local:rollback` — it is used).
- SyncHub pending counts come from the real sources: renderer outbox + MSSQL `pendingRows` per table.
- Small hardening: `telemetry.ts` fallback branch id `"all-branches"` is not a valid UUID — use `null`/omit so heartbeat upserts can't die on type errors.

## Notes / deliberately out of scope
- Bill-number collision on Electron push: after the whitelist fix the remaining failure mode is a central bill-number unique conflict; it will now land in durable quarantine with a clear error instead of silent infinite retry. Auto-renumbering on collision stays a web-checkout behavior (already shipped).
- No changes to the web/Android direct path (it talks to the live cloud schema, no drift).

## Verification
- Typecheck + production build.
- Node syntax check on every edited `.cjs` file.
- Post-migration live query confirming `payment_transactions.client_transaction_id` exists centrally.
