# Cashier payment audit, void history, and product management upgrades

## 1. Cashier payment transactions in audit analysis

A new **Payments by cashier** view inside the audit/analysis area:

- Every completed sale listed with date/time, bill number, cashier, store, terminal, member, total, and the full tender breakdown (cash, each card machine/bank, wallet, transfer, points, voucher).
- Filters: date range, store, cashier, payment method/bank.
- Summary strip per cashier: number of bills, total taken, split by tender, average basket, and cash-vs-card share.
- CSV export honouring the active filters.

## 2. Void & refund history report

New report showing everything that was cancelled, voided or refunded:

- Rows for cart voids, cleared tickets, discarded held tickets, cancelled bills and refunds/exchanges.
- Each row shows when, who did it, their role, store, terminal, the bill or ticket reference, value affected, the reason/note, and who approved it when a supervisor override was used.
- Filters by date range, store, user and event type; drill-down to the original bill where one exists.
- Per-user totals (void count, refund count, refund value) with a highlight when a user is well above the others for that day, and CSV export.

## 3. Category & sub-category management

- New settings page to create, rename, reorder and delete categories and their sub-categories.
- Product form gets a category picker plus a dependent sub-category picker (with "add new" inline).
- Inventory list, reports and the till catalogue can filter by category and sub-category.
- Deleting a category asks what to do with products still using it.

## 4. Product export to Excel

- Export button on Inventory produces an .xlsx of the current filtered list: SKU, barcode, name, category, sub-category, unit, cost, landed cost, price, e-com price, tax, reorder level and stock per branch.
- Same column layout as the bulk import template, so an export can be edited and re-imported.

## 5. Bulk product management

- Checkbox selection in the inventory table with select-all-on-page.
- Bulk actions on the selection: delete, change category/sub-category, set tax rate, toggle e-com visibility.
- Delete asks for confirmation, is permission-gated and writes one audit entry per product removed.

## 6. Same item, different barcode

Two tools, both reachable from the product row:

- **Alias barcodes** — a product can hold unlimited extra barcodes. Scanning any alias at the till, in receiving or in transfers resolves to the same product. Aliases must be unique across the catalogue.
- **Merge duplicates** — when the item was already created twice, pick a master and merge: stock per branch is added together, the loser's barcode becomes an alias on the master, and past sales/PO lines keep pointing at a valid product. The merge is logged in the audit trail.
- Receiving flags a scanned unknown barcode with a "this may already exist" suggestion list (name/SKU match) offering "add as alias" instead of creating a new product.

## 7. Unit of measure

- Each product has a base unit (pcs, box, kg, g, litre, m, pack, set…) with the unit list editable in settings.
- Units flagged as decimal (kg, m, litre) allow fractional quantities at the till and in stock; piece units stay whole.
- Purchase/pack units per product: e.g. 1 carton = 12 pcs. Receiving lets you enter cartons and converts to base stock automatically; transfers and stock counts do the same.
- Unit shows on the cart line, receipt, inventory list and stock reports.

## Technical notes

- Types: `Product` gains `subCategory`, `unit`, `packs: { name, factor }[]`, `barcodes: string[]` (aliases) in `src/lib/pos-types.ts`; a shared `resolveByBarcode()` helper replaces direct barcode equality checks in the till, receiving, transfers and scan bar.
- Cloud migration: `products` gains `sub_category`, `unit`, `packs jsonb`, `barcode_aliases text[]` (unique index across master + alias barcodes); new `product_categories` table (name, parent id, sort) and `uom_units` table, both with grants + staff-only policies matching the existing tables.
- Payments-by-cashier and void reports read the existing `sales.payments` jsonb plus `audit_logs`/`coupon_events`; new routes `src/routes/reports.payments.tsx` and `src/routes/reports.voids.tsx` built on `report-kit.tsx` (ReportHeader, StatCard, downloadCsv) and registered in `src/routes/reports.index.tsx`.
- Void feed reuses the action names in `src/lib/ticket-audit.ts` plus refund/cancel entries already written by `src/routes/receipts.tsx`.
- Excel export uses the SheetJS setup already used by `BulkImportDialog`; import mapping extended for the new columns.
- Merge runs through a `product_merge` server-side routine so stock addition and reference rewrites happen in one transaction, then syncs back into `pos-store`.
- Bulk delete and merge go through the existing durable-write gate (`commitOps`) so nothing is applied before it is stored.
- New permission flags: `can_manage_categories`, `can_bulk_edit_products`, `can_merge_products`.
- Patch version bump as usual.
