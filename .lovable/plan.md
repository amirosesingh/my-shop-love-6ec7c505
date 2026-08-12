# Purchase orders: store scoping, master view, editing and audit

## What the audit found

- **Phase 1.1 is already done.** `loadReceivingInvoices` in `src/lib/pos-db.ts` already
  quotes the branch id: `store_id.eq."<id>",store_id.is.null`, escaping inner quotes.
  No change needed.
- **Phase 1.2 is partly done.** The sync poller (`src/lib/sync-engine.ts`) already uses a
  HEAD count (`select("id", { count: "exact", head: true })`) to probe for changes and then
  a GET to pull rows, and remembers which timestamp column each table has. `purchase_orders`
  is not in the polled table set, so it never fires those probes at all.
- **Phase 2 is mostly satisfied**: `finalize()` stamps `storeId: currentStore.id` — but there is
  no fallback when the terminal has no branch resolved yet, so a blank id can still be written.
- **Phase 3 does not exist**: the history list always filters to the current branch (plus legacy
  rows with a null `store_id`), with no admin master view.
- **Phase 4 exists in part**: an edit dialog already updates header + lines with stock deltas via
  `db.updateReceivingInvoice`. It logs to the activity journal (`logger.log`) but **not** to the
  immutable `system_audit_logs` table, and it has no before/after value capture.
- Database: `purchase_orders` RLS is `is_staff(auth.uid())` only, with no branch scoping, and the
  table has no `store_id` index.

## What will change

### 1. Store id always present on entry
- Add a resolved-branch guard in `src/routes/purchasing.tsx`: on finalize, if `currentStore.id`
  is blank, fall back to the terminal-bound branch (`src/lib/active-branch.ts` /
  terminal session store) before submitting; block the save with a clear message if still unknown.

### 2. Store-wise view + admin master view
- `loadReceivingInvoices(storeId, limit)` gains an `allStores` mode: when asked for the master
  view it skips the `.or()` filter entirely.
- Purchasing screen gets a segmented toggle **Current branch / All branches**, rendered only for
  admins and owners (`isAdmin`, or `can("can_view_all_stores")` if present). Non-privileged staff
  keep the strict current-branch query.
- The history table shows the branch column prominently in master view and disables line editing
  for invoices belonging to another branch unless the user is an admin.

### 3. Purchase order editing polish + audit
- Keep the existing edit dialog; add supplier picker parity with the entry form, an editable
  status/invoice-date pair, and live per-line + invoice recalculation as quantities/costs change.
- On save, in addition to the existing activity log, write an immutable entry through
  `logSystemAction` (`src/lib/system-audit.ts`) with actor id/name/role, `action_type`
  `purchase_order_edit`, `entity_affected` `purchase_orders`, `entity_id`, and `old_value` /
  `new_value` snapshots (header fields plus line quantities/costs).

### 4. SQL file
New re-runnable `supabase/sql/32_purchase_order_scoping.sql`, applied to the managed database too:
- `CREATE INDEX IF NOT EXISTS purchase_orders_store_idx ON public.purchase_orders (store_id)` and
  `purchase_orders_entry_idx` on `invoice_entry_date DESC` so both views stay fast.
- Replace the purchase order SELECT/UPDATE/INSERT policies with branch-aware versions:
  `is_staff(auth.uid()) AND (store_id IS NULL OR store_visible(store_id) OR is_app_supervisor())`,
  so the master view works for supervisors/admins while a branch cashier only sees their own —
  matching the pattern already used on bookings and shifts.
- Same scoping applied to `purchase_order_items` through its parent PO.
- Grants left unchanged (already granted to `authenticated` / `service_role`).

## Technical notes

- Files touched: `src/routes/purchasing.tsx`, `src/lib/pos-db.ts`, new
  `supabase/sql/32_purchase_order_scoping.sql`.
- No change to IPC channels, the sync outbox contract, routing or existing permissions keys.
- Offline behaviour is unchanged: edits still go through `db.updateReceivingInvoice`, which
  queues to the durable outbox when the line is down.
