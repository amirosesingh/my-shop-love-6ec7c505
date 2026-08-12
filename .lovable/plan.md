# Fix the 400 errors on purchase orders and background sync

## What the audit found

- **Purchase orders** are fetched in `src/lib/pos-db.ts` (`loadReceivingInvoices`) with
  `.or("store_id.eq.<id>,store_id.is.null")`. `purchase_orders.store_id` is a **text**
  column, so any branch id containing a comma, dot or space breaks the filter and
  PostgREST answers 400. Quoting the value fixes it.
- **The polling 400s are real and confirmed against the database**: `members`,
  `membership_tiers` and `promotions` have **no `updated_at` column** (only
  `created_at`). The sync poller in `src/lib/sync-engine.ts` asks for
  `updated_at > since` first, gets a 400, then silently retries on `created_at`.
  That is exactly the 400-then-200 pair the network log shows for those three
  tables — data still syncs, but every cycle fires wasted failing requests, and
  rows that are *edited* (not created) are never detected as changed.

`products`, `stores`, `suppliers` and `purchase_orders` already have `updated_at`
and poll cleanly.

## Fix 1 — purchase order filter

Wrap the value in double quotes in `loadReceivingInvoices`:
`store_id.eq."<storeId>",store_id.is.null`, escaping any `"` in the id.

## Fix 2 — add the missing timestamps (SQL file)

New file `supabase/sql/31_updated_at_columns.sql`, also applied to the managed
database as a migration. Re-runnable, no data loss:

- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`
  on `members`, `membership_tiers`, `promotions`
- backfill `updated_at = created_at` for existing rows
- a `BEFORE UPDATE` trigger on each so edits bump the stamp, reusing the existing
  shared `public.update_updated_at_column()` function

## Fix 3 — stop the poller guessing

In `src/lib/sync-engine.ts`, remember per table which timestamp column worked
after the first probe instead of re-issuing a failing `updated_at` query every
30 s. With the SQL applied all six tables settle on `updated_at`; without it the
app degrades quietly to `created_at` and no longer spams 400s.

The Electron worker (`electron/sync/worker.cjs`) does the same probe-and-fallback
on pull, so the same column memo is applied there and the desktop shell matches.

## Technical notes

- Files touched: `src/lib/pos-db.ts`, `src/lib/sync-engine.ts`,
  `electron/sync/worker.cjs`, new `supabase/sql/31_updated_at_columns.sql`.
- No change to sync semantics, permissions, IPC channels or routing.
- After the migration, edits to members, tiers and promotions made centrally will
  actually reach the tills — today only newly created rows do.