# Draft (unfinalized) receiving orders in Purchasing

## 1. How a receiving entry works today

- `/purchasing` (src/routes/purchasing.tsx) is one screen: invoice number, supplier (picker or free text), invoice date, entry date/time, then a scan box that appends lines. Unknown barcodes open an inline "create product" dialog; an Excel/CSV import can fill the same list.
- The line list is **React state only** (`lines: Line[]`). Nothing is written until Finalize; navigating away, logging out or restarting loses the whole entry.
- **Finalize** (`finalize()`): requires invoice number, supplier and at least one line; checks `invoiceNumberTaken()`; builds a `ReceivingInvoice`; awaits `db.commitReceivingInvoice()` (upsert header into `purchase_orders` + lines into `purchase_order_items`, via cloud/local/outbox); then posts stock per line into the central hub, merges cost/price into each product, logs the audit entry, queues put-away rows, clears the form and reloads history.
- **History** ("Invoices received") is a real read: `loadReceivingInvoices(storeId, 100, masterView)` selects `purchase_orders` with nested items, newest first by `invoice_entry_date`.
- **Editing** a saved invoice (`saveEdit()`) is allowed: header by anyone with the permission, lines only for admin/supervisor. It applies **delta** stock adjustments and writes a `system_audit_logs` entry.
- Data model (verified): `purchase_orders` (id, po_number NOT NULL and **UNIQUE**, supplier_name, supplier_id, operator_name, store_id, store_code, invoice_date, invoice_entry_date, total_cost, total_items_count, created_at, updated_at, row_version) and `purchase_order_items` (id, po_id, product_id, barcode, sku, product_name, cost_price, selling_price, quantity_received, subtotal_cost, timestamps, row_version). Mirrored in `database/schema.sql` (SQL Server) and `electron/db/offline_sqlite_v2.sql` (SQLite), registered in `repo.cjs`, `cloud-columns.json`, `central-schema.ts`, `pos-relay.server.ts` and `relay-policy.server.ts` (branch column `store_id`, write gate `can_receive_purchase_order`).

## 2. Reuse the Stock Operations draft table, or a status column?

**Neither reuse nor a new drafts table — add a `status` column to `purchase_orders`.**

Stock counts needed `stock_count_drafts` because `stock_adjustments` is a flat, posted-only audit trail with no header row: there was nowhere to hang a session. Purchasing already has the right shape — a header plus real line rows — so a draft is simply a `purchase_orders` row that has not been posted yet. That keeps one id for the whole life of the entry, keeps line editing on the existing table and avoids a JSON copy of the lines that could drift.

Status values: `draft` | `posted` | `cancelled`, default `posted` so every existing row keeps its current meaning.

## 3. When the draft is created

- A draft row is created **as soon as the first line is added** (scan, inline product creation, or file import) — no manual save step, matching Stock Operations.
- Header edits (invoice number, supplier, dates) before any line exists do not create a row; once a draft exists, they update it.
- Writes are debounced (~800 ms) so fast scanning does not spam the database.
- The page keeps one `draftId` per entry, so repeated edits never create duplicates.

## 4. How the draft grows across sessions

- Every change to the list — add line, change qty/cost/price, remove a line, change header fields — updates the same draft: header upsert + line upserts, plus deletes for removed line ids (the same mechanism `updateReceivingInvoice` already uses).
- Goods arriving on several invoices for the same order: each **invoice** stays its own entry (that is how `po_number` and the history read work today). A draft can be resumed any number of times and lines appended each time; when a second physical invoice arrives, the user starts a new entry rather than mixing invoice numbers on one record.
- Because `po_number` is UNIQUE and NOT NULL, drafts need a number too. The migration relaxes this: `po_number` becomes nullable, the unique constraint is replaced by a **partial unique index on `po_number` where `status = 'posted'`**. Drafts may therefore be numberless or share a placeholder; the number is validated for uniqueness only at finalize, exactly as today.
- Stock is **never** touched while a record is a draft.

## 5. Finding and reopening drafts

- A "Draft receiving orders" section above the history list, fed by the same read filtered to `status = 'draft'` for the current branch (with the existing all-branches toggle).
- Each row shows entry date, invoice number (or "no number yet"), supplier, line count, total cost and who started it. Actions: **Resume** and **Discard**.
- Resume loads the header and lines back into the form and re-reads current product cost/price so nothing is stale. An indicator shows "Draft saved · HH:MM".
- The existing history list is filtered to `status = 'posted'` so drafts never look like received stock, and rows with a legacy NULL status are treated as posted.

## 6. Finalize and discard

- **Finalize** keeps its current validation (number, supplier, at least one line, unique number), writes the header with `status = 'posted'` in the same commit as the lines, then posts stock and runs the existing audit/put-away/refresh path unchanged. Once posted, the record leaves the drafts list and is only reachable through the existing history edit dialog with its current permission rules.
- Double-post is prevented by re-checking status before posting; a record already `posted` is refused.
- **Discard draft** is needed: a confirmation dialog, then the record is set to `status = 'cancelled'` (kept for audit, hidden from both lists) and its lines are left in place. No stock impact.

## 7. Risks to existing data and reports

- `status` defaults to `posted` and is backfilled for every existing row, so history, reports and the audit trail are unchanged.
- The only structural risk is the `po_number` constraint change. Dropping the global unique constraint in favour of a partial unique index keeps duplicate protection for posted invoices — which is the only place it is enforced in the UI — while allowing numberless drafts. Existing rows are unaffected.
- Anything reading `purchase_orders` directly without a status filter (reports, data-comparison, drift tooling) would start seeing drafts; those call sites will be filtered to posted so numbers do not shift.
- Offline/SQL Server mirrors gain the same nullable column with the same default, so sync payloads stay compatible with older tills (an old till simply ignores the column until it heals).

## Technical notes

- One Supabase migration: `ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted'`, backfill, drop `purchase_orders_po_number_key`, make `po_number` nullable, create `purchase_orders_po_number_posted_uidx` unique partial index, plus an index on `(store_id, status)`. A matching runnable file is written to `supabase/migrations/`.
- Offline parity in the same change: guarded `status` column in `database/schema.sql` and `electron/db/offline_sqlite_v2.sql`, plus `electron/db/cloud-columns.json` and `src/lib/central-schema.ts`; verified as in sync before finishing.
- Code: draft helpers in `src/lib/pos-db.ts` (`saveReceivingDraft`, `loadReceivingDrafts`, `discardReceivingDraft`, status on `invoiceRow`/`ReceivingInvoice`, status filters on `loadReceivingInvoices`/`invoiceNumberTaken`), and the draft lifecycle plus drafts list and discard dialog in `src/routes/purchasing.tsx`.
- Version bump via `node scripts/bump-version.cjs`.
