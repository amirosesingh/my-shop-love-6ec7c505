# Audit result and build plan: settings scoping, booking, inventory

## What the audit found

Verified by reading the code and SQL, not assumed.

**Already working — no rebuild needed**
- Single booking entry point: one "Manage Booking" button with a live badge; the duplicate "book & pay later" atom was removed from the till, the layout engine and the palette.
- Dual-flow modal (Standard vs Racket Service), customer lookup by name/phone with tier chip, inline "+ Quick add customer", cart guard with the exact warning toast, pay-later status, racket/string catalogue pickers with customer-provided toggles, tension inputs, inspection notes, locked labour fee with supervisor-gated override, combo rule, job ticket with barcode + QR.
- Categories and sub-categories exist (`product_categories` with a parent link) plus a settings page for them.
- Multiple barcodes per product, a merge dialog, stock adjustments with reasons, and branch-to-branch transfers with a real in-transit state and receive confirmation.
- Bulk Excel/CSV import (SheetJS) exists for the catalogue.

**Genuinely missing or incomplete**
1. Settings scoping stops at two tiers. There are two engines: section overrides (`settings_overrides`, Global + Branch only) and key/value `settings_scoped` (Global → Cluster → Branch). Neither has a **Private / user-or-terminal** tier, and the section engine has no cluster tier. There is no single `getEffectiveSetting()` helper and no inherited-from badges on cashier-facing screens.
2. Racket flow gaps: no barcode scan on the booking item inputs, no liability checkbox for customer-provided gear, no assigned-technician dropdown, branch name not printed on the claim ticket.
3. Inventory list is editable in place (plus/minus stock steppers and an edit dialog), against the "read-only listing" rule. Filters cover name/SKU/barcode plus category and sub-category only — no group, brand, stock status or price range. No item activity drawer.
4. No group tier between category and sub-category; the item form has no dependent Category → Group → Sub-category selectors and no brand field.
5. No real-time duplicate-barcode warning; merge has no guard against items attached to an unpaid booking or pending service job.
6. No `/stock-operations` route. Adjustments and transfers live inside the inventory page; no drag-and-drop spreadsheet import for adjustments and no PO-style review table with cost impact.

## Plan

### Phase 1 — Three-tier settings engine
- Extend the scope options to Global / Cluster / Branch / Private, with Private keyed to the signed-in staff member (falling back to the terminal when no staff is signed in), on both settings engines, with access rules so a user only reads and writes their own private rows.
- Add `getEffectiveSetting(key, ctx)` plus a `useEffectiveSetting` hook resolving Private → Cluster → Branch → Global → shipped default, returning the value and where it came from.
- Add a reusable Scope Selector to the settings pages, honouring existing locks, and a scope badge showing `[Global]`, `[Branch: Downtown]` or `[Private override]` next to cashier-facing read-only values (labour fee, combo rules, tension defaults, currency format, receipt layout).
- Route labour fee, combo rules and tension defaults through the resolver so the till reads the effective value.

### Phase 2 — Racket service completion
- Barcode scan buttons on the racket/string/add-on pickers, reusing the existing scanner (camera on mobile, wedge input on desktop).
- Liability checkbox, required whenever either "customer provided" toggle is on; recorded on the job and printed on the ticket.
- Assigned technician dropdown sourced from active staff at the branch, stored on the booking.
- Claim ticket gains technician name and the effective branch name.

### Phase 3 — Taxonomy and inventory
- Add a group tier (category → group → sub-category) to the catalogue settings page and to the item form as dependent dropdowns; add a brand field.
- Make the inventory list read-only: remove the stock steppers and inline editing, keep view plus links to the edit screen and to Stock Operations.
- Multi-filter bar: text query plus Category, Group, Sub-category, Brand, Stock status and price range.
- Item Activity drawer: created timestamp, edit history and stock movement trail from the existing audit and adjustment records.
- Real-time duplicate-barcode warning modal on entry; merge blocked with a clear reason when either item is on an unpaid booking or a pending service job.

### Phase 4 — `/stock-operations`
- New route with tabs: In/Out adjustments (damage, theft, expiry) and cluster transfers (source → destination, staying in-transit until the destination confirms — reusing the existing transfer engine).
- Drag-and-drop .xlsx/.csv import parsing SKU, quantity and reason with per-row validation errors.
- PO-style review table (SKU, name, current stock, adjustment, expected final stock, unit cost, total value impact) before confirming.

### Technical notes
- Database migrations: extend the scope constraints and add a user column to the scoped settings tables; add product groups (and a group reference on products) plus brand; add technician, liability and ticket fields to bookings; add an item activity view over the existing audit rows.
- Existing tables (`product_categories`, `stock_adjustments`, `stock_transfers`, `settings_scoped`) are reused rather than duplicated — no separate `system_settings`, `service_jobs`, `product_barcodes` or `item_merges` tables, since equivalents already exist.
- Each phase ships end-to-end (schema, resolver, UI, toasts) and is checkable in the preview before the next begins.