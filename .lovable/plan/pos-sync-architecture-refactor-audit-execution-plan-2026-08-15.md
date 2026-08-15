# POS Sync Architecture Refactor — Audit + Execution Plan

## Audit findings (verified against the code)

**Already built**
- Desktop push/pull worker (`electron/sync/worker.cjs`) with 50-row batches, per-table high-water marks, attempt caps, relay-first upserts.
- Relative inventory: product pushes strip absolute stock; movements apply through the `stock_apply_delta` function, keyed by movement id so retries can't double-deduct.
- MSSQL mirror (`electron/db/repo.cjs`) covers 21 tables in dependency order, with sync flag columns and pruning rules.
- Read failover through `dbRouter.queryWithSource` plus the "last synced copy" notice on several screens.

**Gaps confirmed**
- The SQLite engine (`electron/db/offline_sqlite_v2.sql`) has **no** `is_synced`, `sync_status`, `row_version`, or `client_transaction_id` columns on any mirror table, and is missing mirrors for purchase orders/items, stock transfers/items, suppliers, held orders, promotions, membership tiers, product categories, uom units, and `stock_delta_applied`.
- `offline_sync_queue.action_type` allows only INSERT/UPDATE — deletes can never be queued.
- `sync_metadata` is keyed on `table_name` alone, so one machine cannot track two branches/terminals.
- Two queues coexist: `offline_sync_queue` (SQLite) and the legacy `outbox` plus the browser-side outbox; retry counters live partly in memory in the worker, so retry state is lost on restart.
- Cloud has `row_version` on `products` only; no other table carries it and there is no shared bump trigger.
- Direct cloud calls remain in 6 UI files (`StaffManager`, `settings.notifications`, `SecureCredentials`, `ConnectionCheck`, `settings.sessions`, `reports.history`) and 17 call sites in `src/lib/pos-db.ts`.

## Plan

### Phase 1 — Schema alignment
- Cloud migration: add `row_version integer not null default 1` to every operational table plus a shared bump trigger on UPDATE (products already has one; reuse it).
- SQLite (`offline_sqlite_v2.sql` + migration path in `sqlite.cjs`): add `is_synced`, `sync_status`, `updated_at`, `row_version` to every mirror table; add unique `client_transaction_id` on `sales` and `sale_items`; create the 11 missing mirror tables; widen `action_type` to include DELETE; rebuild `sync_metadata` with a composite key of table/store/terminal.
- MSSQL script (`db/offline/pos-offline-sqlserver.sql`): same column and mirror-table additions so both local engines match.

### Phase 2 — Offline decoupling
- Route the 6 UI screens through `dbRouter` (local first on desktop, cloud on web); keep genuinely central-only actions (staff RPCs, credential save) online-gated with a clear offline notice rather than a silent failure.
- Convert the 17 `pos-db.ts` cloud reads/writes to `dbRouter`/local-engine calls so a till never depends on the network for sales history, shifts, sessions, purchase orders, or held orders.

### Phase 3 — Conflict resolution and one queue
- `sync-engine.ts`/worker: carry `row_version` in payloads, overwrite the local row only when the cloud version is higher, and bump the version on every accepted write.
- Fold the legacy outbox into `offline_sync_queue`; persist `attempts` and `last_error` in that table so retry state survives restarts; mark rows past the attempt cap as `DEAD_LETTER`.
- Surface dead letters on the Sync & backup screen with retry/discard.
- Throw an explicit auth error when no bearer/cashier/terminal token is present instead of falling back to the anonymous client.

### Phase 4 — Two-way engine
- Push: read `offline_sync_queue` in 50-row batches, send `client_transaction_id` for idempotency, keep inventory as deltas, flag rows synced on success only.
- Pull: query per table where cloud `updated_at` beats the store/terminal-scoped watermark, merge by `row_version`, then advance that watermark.

## Notes
- Web build behaviour is unchanged: online-only, no queuing.
- Each phase ends with a typecheck; the schema files ship as additive migrations so existing installs upgrade in place.
