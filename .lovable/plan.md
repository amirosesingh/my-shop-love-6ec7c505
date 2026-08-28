# Persistent draft stock counts in Stock Operations

## 1. How it works today

- `/stock-operations` (src/routes/stock-operations.tsx) has three tabs: Physical count, Bulk import, Transfers.
- The queue is **React state only** (`rows: CountRow[]`). Scanning a code + entering a counted quantity adds/replaces a row; the bulk import fills the same array. Rows can be removed with the trash icon.
- There is **no hold/park feature** in Stock Operations today, and nothing is written until you press **Post adjustments**. A refresh, logout, or app restart loses the entire queue.
- Reason (default "stock count") and Note are chosen at the bottom; both are effectively optional.
- **Post** calls `applyStockCount(entries, reason, note, storeId)` in src/lib/pos-store.tsx: for each row where counted differs from system it writes a `stock_adjustments` row (product, store, reason, note, previous/updated stock, delta, cost impact) and updates the product's stock for that branch. Then the queue is cleared.
- `stock_adjustments` exists in the central database, in the Windows SQL Server file (database/schema.sql) and in the offline SQLite mirror (electron/db/offline_sqlite_v2.sql). Each row is one product line — there is no header/session record.

## 2. Data model changes

New table `stock_count_drafts` (one row per counting session, lines stored as JSON), rather than adding a status column to `stock_adjustments` — that table is a posted-only audit trail and existing reports read it unfiltered.

Fields:
- `id` (text/uuid, primary key)
- `store_id` — branch the count belongs to
- `terminal_id`, `staff_id`, `staff_name` — who/where it was started
- `status` — `draft` | `posted` | `discarded` (default `draft`)
- `reason` — nullable while draft, required at post
- `note` — optional text
- `lines` — JSON array of `{ productId, name, sku, category, subCategory, system, counted, cost }`
- `line_count`, `total_impact` — denormalised for the drafts list
- `posted_at`, `posted_by` — set on post
- `is_synced`, `sync_status`, `created_at`, `updated_at` — same convention as every other table here

No change to `stock_adjustments` itself, except that posted lines gain a `draft_id` column (nullable) linking them back to the session for audit.

## 3. When the draft is created and updated

- The page holds one `draftId` for the session. The first row added to the queue (scan or import) creates the draft record immediately; every later change (add, edit, remove, reason/note change) updates that same record — no duplicates.
- Writes are debounced (~800 ms) so scanning fast doesn't spam the database.
- Removing the last row keeps the draft (empty) so a resumed session isn't lost; discarding is explicit.
- Reason and note stay optional while in draft.

## 4. Resuming a draft

- A fourth tab, **Open drafts**, lists drafts for the current branch: started at, staff, item count, total impact, reason. Actions: Resume, Discard.
- Resuming loads the lines back into the queue, re-checks each product's current system stock (it may have moved since), and flags any line whose system figure changed.
- The count tab shows a small "Draft saved" indicator with the last saved time.

## 5. Post and Discard

- **Post to Adjustment**: requires a reason (validated only here) and at least one variance line. It writes the `stock_adjustments` rows and updates stock exactly as today, then marks the draft `posted` with `posted_at`/`posted_by`. Posted drafts are read-only — Resume is replaced by a View action.
- **Discard draft**: confirmation dialog, then the draft is marked `discarded` (kept for audit, hidden from the list). No stock impact.
- Posting is guarded against double-submit so one draft can never post twice.

## 6. Risks

- Existing posted adjustments are untouched; the new `draft_id` column is nullable so historical rows and existing stock reports keep working.
- Two terminals resuming the same draft could post it twice — prevented by the status check at post time (a draft already `posted` is refused).
- Offline Windows tills write drafts to the local mirror and sync them up like every other table; a draft created offline on one machine isn't visible on another until it syncs.

## Technical notes

- Migration: one Supabase migration creating `public.stock_count_drafts` with GRANTs and branch-scoped RLS matching the existing `stock_adjustments` policies, plus the `draft_id` column on `stock_adjustments`.
- Offline parity: matching guarded statements in `database/schema.sql` (SQL Server) and `electron/db/offline_sqlite_v2.sql` (SQLite), plus the table registered in `electron/db/repo.cjs`, `electron/db/cloud-columns.json`, `src/lib/central-schema.ts` and the relay allowlist so sync and the Schema Manager see it.
- Draft read/write helpers added to the data layer used by `pos-store`, so Web/Android (online-only) and Electron (local-first) both work through the existing router.
- Version bump via `node scripts/bump-version.cjs`.
