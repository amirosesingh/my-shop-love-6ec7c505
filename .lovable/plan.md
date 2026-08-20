# Part 5 — Batch stock deltas, safe retry, and reconciliation

Keeps the existing model exactly as it is: absolute stock is still stripped from product upserts, movement rows are still the ledger, `stock_apply_delta` and `stock_delta_applied` still guarantee once-only application. What changes is how many round trips it takes, what happens when one fails, and whether anyone can see a drift.

## 1. Batch application

Add a new database routine `stock_apply_deltas` that takes an array of movements (id, product, branch, delta) and returns one result row per movement: applied, already applied, or refused with a short reason. It reuses the single-movement logic per element so the replay guard and the branch check are unchanged, de-duplicates repeated movement ids inside the same batch, and never lets one bad movement discard the good ones in the batch.

Branch isolation is untouched: each movement is still checked against the caller's visible branch, and a movement for another branch is refused individually rather than allowed through.

The till calls the batch routine once per commit instead of once per line. When the routine is not present (older backend), it falls back to the current per-movement calls, so nothing breaks mid-rollout.

## 2. Retry that can't double-deduct

The parked-movement list becomes a proper retry queue:

- Each parked movement records why it failed and whether it is retryable. Connection and temporary database faults are retryable; refusals for permission, unknown product or invalid data are marked permanent and are shown for a human to resolve instead of being retried forever.
- Retries carry the same movement id, so the central replay guard makes a repeat harmless.
- Retryable entries get an attempt count and a backoff, and are flushed in one batch when the till comes back online.
- Retrying never writes a new movement row — only re-applies existing ones.

## 3. Reconciliation

A reconcile action in Data Sync & Audit compares this branch's movement ledger against what the central database recorded as applied, and reports three things: movements with no application recorded, movements recorded more than once, and products whose central figure does not match the sum of applied movements. The result is written as diagnostics events (identifiers and codes only) and shown in the hub with a retry action for the first category.

## 4. Checkout guarantees

Checkout behaviour is unchanged where it already works: the sale is committed and durable before any stock call, offline commits still queue, and the outcome of the stock step never decides whether the sale succeeded. The change is that a failed stock step is now recorded as a retryable queue entry with a reason rather than a bare note, and the desktop sync worker uses the same batch routine after pushing movement rows.

## Tests

New tests cover: single-line sale, 30-line basket in one batch, replaying a duplicate movement id, a batch where some movements fail and others succeed, retry after a failure, offline queue then reconnect, a duplicate push, two movements against the same product, and a movement aimed at another branch being refused. Existing suites must stay green (`bunx vitest run`).

## Benchmark

Measure round trips for baskets of 1, 10 and 30 lines on the old and new paths and report the reduction, plus the remaining limitations (fallback path still sequential, reconciliation is per-branch and on demand).

## Technical notes

- New migration: `public.stock_apply_deltas(_movements jsonb)` returning `(movement_id uuid, status text, balance integer, reason text)`, security definer, `store_visible` check per element, `GRANT EXECUTE` to authenticated and service_role; plus a read-only `stock_reconcile(_store_id text)` returning the three drift categories.
- `src/lib/pos-db.ts`: `applyStockDeltas` sends one batch call, maps per-movement results, falls back to the per-movement RPC on a missing-function error.
- `src/lib/stock-recovery.ts`: add `retryable`, `attempts`, `nextAttemptAt` to parked entries; batch flush; keep the existing storage key with a tolerant read of old entries.
- `src/lib/diagnostics.ts`: add a `stock_reconcile_drift` kind.
- `electron/sync/worker.cjs`: `applyStockDeltas` uses the batch RPC with the same fallback.
- `src/components/pos/sync/SyncHub.tsx`: show retryable vs blocked entries and a reconcile button.
