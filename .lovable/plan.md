# Stock Operations: reference numbers, record list, and count dialog

## 1. How draft auto-save works today (confirmed by reading the code)

In `src/routes/stock-operations.tsx`:

- The counting queue lives in React state (`rows`). An effect watches `rows`, `reason`, `note`.
- The first queued line mints a `crypto.randomUUID()` draft id and stamps `draftCreatedAt`; every later change re-saves that same id after an 800 ms debounce via `db.saveStockCountDraft(...)`, then sets a "last saved" timestamp. One session can never leave two drafts.
- `db.saveStockCountDraft` is an upsert on `stock_count_drafts.id` (lines stored as JSON, plus `line_count`, `total_impact`, branch, terminal, staff).
- Posting calls `applyStockCount(...)` then `db.setStockCountDraftStatus(id, "posted")`; discarding sets `"discarded"` and never touches stock.
- The Open drafts tab lists `status = 'draft'` rows for the current branch only (`db.listStockCountDrafts(storeId)`, newest first, limit 50) with resume/discard. There is no full history view and no separate "resend count" menu — the tabs today are Physical count / Bulk import / Open drafts / Transfers.

Everything below is built on top of this; the save path and status model stay exactly as they are.

## 2. Existing numbering

- Sales use `src/lib/bill-number.ts` — `BRANCH-PLATFORM+TILL-YYYYMMDD-SEQ`, configured in Settings > Bill numbering (`settings.numbering.tsx`), stored under `settings.integrations.billNumbering`, local counter in `pos.bill.seq`.
- Purchasing has no generated number: `po_number` is the supplier's invoice number typed by the user.

So Stock Operations needs a **new scheme**, deliberately styled after the bill-number module (same prefix/padding/reset concepts, same settings surface) rather than reusing the receipt counter.

## 3. Reference number plan

New `src/lib/stock-ref.ts` mirroring `bill-number.ts`:

- Format: `PREFIX-BRANCH-PERIOD-SEQ`, e.g. `SO-B101-202608-0007`. Period segment is empty when reset is "never", `YYYY` for yearly, `YYYYMM` for monthly.
- Config in `settings.integrations.stockNumbering`: `prefix` (default `SO`), `startNumber` (default 1), `padding` (3–6, default 4), `reset` (`never | yearly | monthly`), `includeBranch` (default on).
- Counter persisted per branch+period in local settings (`pos.stockref.seq`, same helper style as the bill counter) so it works offline; the reference is minted **at the moment the draft row is first created** and stored on the row, never regenerated.
- Collision safety: unique index on `reference` in the central DB; on a duplicate-key rejection the client bumps the counter and re-saves — the same defensive pattern used for bill numbers.
- New Settings tab **Stock numbering** (`/settings/stock-numbering`) with a live sample, matching the layout of the bill numbering page.

## 4. Manual "Save Draft" button

Same mechanism, no second path. Refactor the debounce effect body into a single `persistDraft()` callback:

- Auto-save: debounce timer calls `persistDraft()`.
- Button: cancels the pending timer, then calls `persistDraft()` and shows "Draft saved".
- A `savingRef` guard makes overlapping calls no-ops until the in-flight save resolves, and the draft id/reference are minted once (in `ensureDraft()`), so both paths write the same row. Button is disabled when the queue is empty or there are no unsaved changes.

## 5. Default list / history view

New "Records" tab, which becomes the default landing tab (Physical count stays as a tab and is unchanged; Open drafts folds into this list via a status filter rather than being deleted).

Columns: Reference · Status (Draft / Posted / Discarded) · Date (created, posted date on hover) · Branch · Items (line count) · Net impact · Created by · Posted by · Actions (View / Resume or Edit / Discard).

Filters: status, date range, and a branch selector — "This branch" (default) vs "All branches", following the existing pattern in `reports.stock.tsx`. The all-branches option only appears when more than one store exists. New data-layer call `db.listStockCountRecords({ storeId | all, status, limit })` alongside the existing `listStockCountDrafts` (which stays, so nothing that uses it breaks).

## 6. New count as a dialog

- The Records tab gets a primary **New count** button opening a large `Dialog`.
- The entire current counting UI (punch bar, review table, reason, note, impact, Save draft / Discard / Post) moves unchanged into `src/components/pos/StockCountDialog.tsx`; the queue, debounce effect, and post/discard logic are lifted verbatim into that component with a `draft?` prop for resuming.
- The route keeps `/stock-operations` and its tabs; closing the dialog leaves the draft saved and refreshes the list. Autofocus on the code field is preserved on open.

## 7. View vs Edit, and the approval gate

- **View**: any row opens a read-only dialog — header (reference, branch, status, who/when) and the item table with system, counted and variance. Always allowed.
- **Edit** on a *draft*: opens the count dialog pre-loaded (today's resume behaviour, unchanged).
- **Edit** on a *posted* record: the entry point exists but is marked "Requires approval", disabled with a tooltip explaining an approval request is needed. A single `canEditPosted()` stub in the new module returns `false` for now, so Task 6/7 wires the real approval check in one place without touching the UI.

## 8. Risks

- The draft effect is the delicate part: moving it into a dialog component risks re-mounting and minting a second draft. Mitigated by keeping the draft id in the dialog's own state, creating it only in `ensureDraft()`, and not remounting the dialog while open.
- Existing draft rows have no reference; the list shows a `—` placeholder for them and a backfill in the migration assigns references to existing rows in created-at order.
- Posted `stock_adjustments` are untouched — no change to `applyStockCount` or `/reports/stock`.
- Making Records the default tab changes where the page lands; Physical count remains one click away. Say the word if you'd rather Physical count stay the default.

## Technical notes

Schema (Supabase migration + `database/schema.sql` + `electron/db/offline_sqlite_v2.sql` + `electron/db/cloud-columns.json` + `src/lib/central-schema.ts`, all kept in sync):

- `stock_count_drafts.reference text` + partial unique index on non-null references.
- `stock_count_drafts.store_code text` (branch label for the all-branches list without a join).
- Index on `(store_id, status, created_at desc)` for list paging.
- Backfill references for existing rows.

Files touched: `src/lib/stock-ref.ts` (new), `src/routes/settings.stock-numbering.tsx` (new) + SettingsTabs entry, `src/components/pos/StockCountDialog.tsx` (new), `src/components/pos/StockRecordView.tsx` (new), `src/routes/stock-operations.tsx`, `src/lib/pos-db.ts`, `src/lib/pos-types.ts` (settings type).

No enforcement logic for approvals is added — only the gated entry point and the `canEditPosted()` stub.
