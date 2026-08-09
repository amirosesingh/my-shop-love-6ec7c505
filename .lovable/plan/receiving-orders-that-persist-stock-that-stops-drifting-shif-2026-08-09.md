# Receiving orders that persist, stock that stops drifting, shifts that stay open

## Audit findings (verified in the code)

**Receiving / purchase orders**
- There are no `receiving_orders`, `supplier_invoices` or `stock_movements` tables anywhere in the project. Receiving runs entirely on `purchase_orders` + `purchase_order_items` (`supabase/sql/06_inventory_ops.sql`). Nothing auto-deletes them; there is no cleanup job and no cascade other than items following their own order.
- Why invoices "disappear": in `src/routes/purchasing.tsx` the "Invoices received history" table is plain component state (`useState<InvoiceLog[]>([])`). It is never read back from the database, so it empties on every reload. The database write itself is fire-and-forget (`db.recordPurchaseOrder`, queued through the outbox, no confirmation, no error surfaced).
- `purchase_orders.po_number` has a UNIQUE constraint. Re-using or correcting an invoice number fails silently inside the outbox — the user sees a success toast either way.
- Supplier is a free-text box; the `suppliers` table is not used on this screen and `purchase_orders.supplier_id` is never set.
- There is no way to reopen or edit a finalized invoice at all.

**Inventory quantity drift — root cause found**
- In `finalize()` the code captures `before` (the product as it was), calls `adjustStock(...)` to add the received quantity, and then, when the cost changed, calls `upsertProduct({ ...before, cost })` with that *stale* snapshot. That second write overwrites the stock it just added — quantities silently revert. Inline-created items also start with `stockByStore` zeroed for every store.
- `productToRow` in `src/lib/pos-db.ts` recomputes `stock_quantity` as the sum of `stock_by_store`. Any writer that sends a partial or empty `stock_by_store` map zeroes the headline quantity in the backend even though it never intended to touch stock.
- No database trigger resets stock. The drift comes entirely from these client write paths.

**Shift state**
- Shifts already live in one `shifts` table keyed by `store_id` + `status = 'OPEN'`, with terminal attribution; `closeShift` is only reachable from the explicit Close Shift action, and logout only stamps *sign-in sessions* (`endShiftSessions`), never the shift. So nothing closes a shift on logout today.
- What *looks* like an auto-close: on sign-out `signedIn` flips false and the store resets `dbShift = null`, `shiftChecked = false`; after signing back in, `loadActiveShift` can throw before the new cashier's relay credentials exist, and `refreshActiveShift` marks any locally cached open shift for that store as CLOSED whenever the read returns nothing. The shift is still OPEN in the database, but the terminal shows locked / "no shift".
- `activeShift` also requires `dbShift.storeId === activeBranchId(...)`; a terminal whose bound branch differs from the shift's branch sees no shift.

## What will be built

### 1. Receiving orders become real, durable records
- Persist and reload the invoice history: on load, read `purchase_orders` (with their lines) for the branch and render that list instead of in-memory state.
- Finalize becomes an awaited, confirmed write: the invoice and its lines are committed (or queued offline with a visible pending state) before the success toast. A duplicate invoice number produces a clear error instead of a silent failure.
- `invoice_entry_date` (new nullable column on `purchase_orders`) defaults to the moment of entry, with a date+time control so an authorized user can override it, and the invoice number stays editable after saving.
- Supplier becomes a picker sourced from `suppliers`, storing `supplier_id` alongside the existing `supplier_name`; typing a new name still creates/uses a supplier record.

### 2. Editing a saved invoice
- Open any past invoice in an editor: unit cost, selling price, quantity received, SKU/item number and product name per line, plus invoice number, supplier and entry date.
- Saving applies **delta** adjustments only: stock moves by (new qty − old qty) for that branch, cost/price updates go to the product record, and the invoice row is updated in place. No delete-and-recreate, so nothing is wiped and no history is lost.
- Every edit writes a `stock_adjustments` row with reason and before/after quantities, keeping the movement trail complete.
- Gated behind `can_receive_purchase_order`; editing lines after finalization additionally requires manager/admin.

### 3. Stock synchronisation fixes
- Fix the stale-snapshot overwrite in `finalize()` — cost/price updates merge into the *current* product state, never a stale copy.
- Make `adjustStock` and the receiving path read-modify-write against the latest product, and make `productToRow` refuse to zero `stock_quantity` when the caller sends no `stock_by_store` data.
- After a finalize or an invoice edit, re-read the affected products from the backend so the register and inventory grid show the same number as the database instead of a cached one.
- Inline-created products start with the received quantity in the receiving branch rather than a zero map.

### 4. Shift locking hardening
- The open-shift lookup keys strictly on terminal branch + `status = 'OPEN'`; a sign-out/sign-in cycle no longer clears the cached shift — it re-reads and keeps showing the open shift until the database says otherwise.
- `refreshActiveShift` stops marking cached shifts CLOSED on an empty or failed read; only a real close does that.
- User switch, lock and logout leave `shifts.status = 'OPEN'` untouched — there is no code path doing so today, and a regression test will pin it.
- Close Shift stays permitted for the opening cashier on that terminal and for any admin/supervisor, and keeps requiring counted-cash reconciliation before the state flips to CLOSED. The close dialog will show expected vs counted and the variance explicitly.

## Technical notes

- One additive migration: `purchase_orders.invoice_entry_date timestamptz`, `purchase_orders.updated_at`, `purchase_order_items.sku`, plus a permission-checking trigger on purchasing writes. Nothing dropped, nothing seeded, no cascade added.
- No new `supplier_invoices` / `stock_movements` tables — the existing `purchase_orders` / `purchase_order_items` / `stock_adjustments` trio already covers invoices, lines and movement history, and reusing them keeps every existing report working.
- Files touched: `src/routes/purchasing.tsx`, `src/lib/pos-db.ts`, `src/lib/pos-store.tsx`, `src/lib/suppliers.ts`, a new invoice-editor component, and a new `supabase/schema32.sql`.
- Version bump to the next patch so the desktop and APK feeds pick it up.