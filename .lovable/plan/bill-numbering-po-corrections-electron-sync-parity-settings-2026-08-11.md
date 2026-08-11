# Bill numbering, PO corrections, Electron sync parity, settings redesign

## What the scan found

- `src/lib/bill-number.ts` already exists and produces `B101-PC01-20260811-0001`, with the
  device sequence in local storage; `src/lib/pos-store.tsx` uses it for every new sale.
- `client_transaction_id` is already written by `src/lib/pos-db.ts` (`saleAttemptExists`
  checks it before insert) and the local MSSQL schema already has the column plus unique
  indexes on `bill_number` and `client_transaction_id`.
- The central (self-hosted) database this app talks to does **not** have the column yet —
  that is exactly what "column sales.client_transaction_id does not exist" means. Every read
  of the sales list asks for it, so the whole load fails.
- The PO edit dialog saves corrections and applies stock deltas, but does not recalculate
  landed cost, does not write a stock-adjustment record, and its audit entry stores only the
  new values, not before/after.
- The Electron sync worker pushes `repo.TABLES`, which is missing `held_orders`,
  `stock_adjustments`, `drawer_events` and `shift_sessions`.
- `/settings` is a list of links; the UI kit already ships an accordion component.

## Task 1 — Bill numbers, unique indexes, and the load failure

- **Database repair (needed first).** One migration adds `client_transaction_id` to `sales`
  if absent, de-duplicates any repeated bill numbers, then creates unique indexes on
  `bill_number` and on `client_transaction_id` (partial, ignoring nulls). The same SQL is
  saved as `supabase/sql/30_sales_unique_keys.sql` so the on-premise database can be brought
  in line, and the reader in `pos-db.ts` degrades gracefully: if the column is still missing,
  the sales list loads without it instead of failing outright.
- **Settings.** A new "Bill numbering" card on the receipts settings page: branch code
  override (blank = the branch's own code), device/terminal number, sequence padding,
  reset-daily switch, and a live sample of the next number. Values are stored with the other
  POS settings so they follow the branch, and `bill-number.ts` reads them with the current
  behaviour as the default.
- **Date in the configured time zone.** `dayStamp` uses the region time zone from settings
  rather than the machine clock.
- **Idempotency.** The checkout attempt id is generated once when payment starts (not per
  retry), checked against the cloud and then the local mirror before insert, and an existing
  sale is returned instead of a second insert.
- Old-format numbers keep printing, searching and reporting exactly as they do today.

## Task 4 — Purchase order corrections

- The edit dialog stays; saving now computes a full delta against the stored invoice:
  per-line quantity changes, cost and landed-cost recalculation, supplier and totals.
- Each changed line writes a `stock_adjustments` row (reason "invoice correction") with the
  before/after count, so branch stock stays reconcilable.
- The audit entry records before/after for supplier, invoice number, totals and each changed
  line rather than only the new state.
- All writes go through the existing durable gateway, so a correction made offline queues and
  syncs later.

## Task 5 — Electron sync parity and housekeeping

- `repo.TABLES` gains `held_orders`, `stock_adjustments`, `drawer_events`, `shift_sessions`
  (with matching local tables where missing), ordered so parents push before children; ids
  stay stable so a replay updates instead of duplicating.
- A startup housekeeping pass in the Electron main process: remove orphaned temp/cache files,
  delete mirrored rows already confirmed synced and older than the retention window (default
  90 days), then reclaim space. Pending (unsynced) rows, open shifts and held orders are never
  touched.

## Task 6 — Settings redesign

- `/settings` becomes six category cards — General, Terminal & display, Printing,
  Tax & billing, User permissions, Sync & network. Selecting one expands its section directly
  beneath the cards; every existing settings page stays reachable by its own URL.
- Dense groups (permissions, printers, tax rules) use the existing accordion component.
- Field groups get inline validation and a "Saving… / Saved" indicator.

## Technical notes

- Files: `src/lib/bill-number.ts`, `src/lib/pos-db.ts`, `src/lib/pos-store.tsx`,
  `src/routes/settings.index.tsx`, `src/routes/settings.printer.tsx` (numbering card),
  `src/routes/purchasing.tsx`, `electron/db/repo.cjs`, `electron/db/schema.sql`,
  `electron/sync/worker.cjs`, `electron/main.cjs`; new `supabase/sql/30_sales_unique_keys.sql`.
- Tests: bill-number format and per-day sequencing, duplicate-checkout idempotency, PO edit
  stock delta, schema-cache retry, and loader state transitions.
- No new dependencies. Version bumped on completion.
