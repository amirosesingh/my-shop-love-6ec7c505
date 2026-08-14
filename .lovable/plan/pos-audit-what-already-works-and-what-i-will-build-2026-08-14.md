# POS audit: what already works, and what I will build

## Audit result (verified in code, not assumed)

**Already in place**
- Single booking entry point: one "Manage Booking" button (`src/routes/index.tsx`) plus the `book.hub` canvas action; the dual-choice modal (Standard vs Racket Service) exists. No duplicate booking buttons remain.
- Racket flow: catalogue pickers, customer-provided toggles, tension inputs, inspection notes, read-only labour fee with supervisor override, combo rule, QR job ticket.
- Cart guard with the pay-later warning toast.
- Canvas: fixed logical canvas with uniform `transform: scale()`, a scale-aware drag/resize strategy, and an "Add Group Box" toolbar action wired to `layout.addGroup()`.
- Four-tier settings resolution (Private > Branch > Cluster > Global > default) with scope panel and source badges.
- Multi-barcode per product, merge dialog, stock adjustments, branch transfers with in-transit + receive, bulk Excel/CSV catalogue import, Z-report shift close, loyalty points on members.

**Missing or wrong**
1. Group boxes are created empty only — selecting objects and wrapping them is not implemented, and there is no "select at least one item" toast.
2. Inventory list is editable in place: `+ / -` stock steppers call `adjustStock` directly in the table. No Category/Sub-category columns with dependent filters, and no per-item activity drawer.
3. No `/stock-operations` route at all: no barcode punch bar, no counted-quantity workflow, no PO-style review table, no drag-and-drop adjustment import.
4. Taxonomy is two levels (category + free-text sub-category) with no Group tier, no CRUD panel for groups/sub-categories/units, and no delete protection when products are attached.
5. No real-time duplicate-barcode warning on item create/edit; merge has no lock against unpaid bookings or pending service jobs.
6. Racket flow gaps: no barcode scan on the gear inputs, no liability checkbox, no assigned-technician dropdown.
7. No serial-number capture at checkout, no points on stringing labour, no persisted shift reconciliation record.

## Plan

### Phase 1 — Canvas group boxes
- Add marquee/ctrl-click multi-select on the canvas, hit-testing from `getBoundingClientRect()` divided by the current scale so clicks land correctly at any zoom.
- "Add Group Box" wraps the current selection in a group whose bounds enclose the children; with nothing selected it shows the toast "Please select at least one item to group."
- Keep the toolbar above the canvas overlay so its buttons always receive clicks.

### Phase 2 — Taxonomy
- Add a Group tier between category and sub-category (new table + product column), and a Catalogue Taxonomy settings panel with full CRUD for Categories, Groups, Sub-categories and Units.
- Block deletion when products are attached, with the modal "Cannot delete category. Reassign attached products first."
- Item form gains dependent Category → Group → Sub-category selectors.

### Phase 3 — Read-only inventory
- Remove the stock steppers and inline edits; stock renders as a badge ("42 in stock") linking to Stock Operations.
- Add Category and Sub-category columns plus dependent filters (category, group, sub-category, brand, stock status).
- "View log" drawer per item: created timestamp, edit history, and stock movement trail from the existing audit and adjustment records.

### Phase 4 — `/stock-operations`
- New route with tabs for Physical Count / Adjustments and Cluster Transfers.
- Auto-focused punch bar: scan or type a barcode, the product loads, the counted quantity is entered, Enter queues the line with the computed delta and returns focus to the bar.
- PO-style review table (SKU, name, category, sub-category, system stock, counted, delta, unit cost, total impact) before commit; transfers reuse the existing in-transit engine.
- Drag-and-drop .xlsx/.csv import with per-row taxonomy validation and error highlighting.

### Phase 5 — Duplicates and merging
- Real-time duplicate-barcode check while typing on create/edit, with a warning modal offering "go to existing item" or "merge".
- Merge blocked with a clear reason when either item is attached to an unpaid booking or a pending service job.

### Phase 6 — Racket flow completion
- Barcode scan buttons on the racket/string/add-on pickers (camera on mobile, wedge input on desktop).
- Liability checkbox, required whenever either "customer provided" toggle is on, recorded on the job and printed on the ticket.
- Assigned technician dropdown from active branch staff; technician name and branch printed on the claim tag.

### Phase 7 — Retail extras
- Serial-number capture per line at checkout, stored on the sale item and printed on the receipt.
- Loyalty points earned on stringing labour as well as retail lines.
- Persist each shift close as a reconciliation record (opening cash + cash sales − payouts vs counted) backing the existing printable Z-report.

## Technical notes
- Migrations: `product_groups` (+ group reference on products), sub-category normalisation, `product_barcodes` with variant/batch cost, `item_activity_logs`, `item_merges`, `stock_adjustment_items`, `shift_reconciliations`, serial column on `sale_items`. Every new public table ships with grants, RLS and policies in the same migration.
- Existing tables are reused rather than duplicated: `product_categories`, `uom_units`, `stock_adjustments`, `stock_transfers`, `settings_overrides`, `members.loyalty_points`. No separate `system_settings` or `service_jobs` table — the settings engine and `bookings` already cover them.
- Each phase ships end-to-end (schema, queries, UI, toasts) and is checkable in the preview before the next starts.