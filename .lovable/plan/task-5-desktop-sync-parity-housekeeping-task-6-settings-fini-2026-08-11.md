# Task 5 — Desktop sync parity & housekeeping, Task 6 — Settings finishing touches

## Task 5: the Windows till syncs everything the web app writes

Today the desktop's local database and sync worker cover sales, sale items, purchase
orders and items, transfers, shifts, bookings, members, audit logs and the catalogue.
Two things the web app writes every day are missing locally — **stock adjustments**
and **held (parked) orders** — plus **suppliers**, which purchase orders point at. On a
till working offline those actions are lost or fail.

What changes:

- Add `stock_adjustments`, `held_orders` and `suppliers` to the local database, matching
  the cloud column names, and include them in the sync queue in dependency order
  (suppliers before purchase orders; held orders and adjustments after products).
- Every row keeps the id it was born with, so a replay after a dropped connection
  updates the same record instead of creating a second one.
- Suppliers also join the "cloud is authoritative" pull list, so a supplier added at head
  office appears on the till.
- Existing installs upgrade in place on next launch — no reinstall, no data loss.

### Startup housekeeping

A short cleanup pass runs once, a few seconds after the till window opens, so it never
delays the register:

- Delete leftover temporary and cache files from interrupted updates and print jobs.
- Remove mirrored rows that the cloud has already confirmed and that are older than a
  retention window (90 days, configurable in Settings › Sync & backup).
- Shrink/repair the local database indexes so it stays fast.

It never touches rows still waiting to sync, anything from an open shift, or configuration.
The result is written to the sync log so an admin can see what was reclaimed.

## Task 6: finish the settings redesign

The category cards with inline expansion are already live. Remaining pieces:

- **Accordions inside dense pages** — screen visibility (per-role lists), receipt printer
  options, and tax rules get collapsible groups so a long page opens compact.
- **Inline validation** — bad values (a negative tax rate, an empty company name, a
  malformed printer port) show a short message under the field instead of failing silently.
- **Auto-save indicator** — each field group shows "Saving…" then "Saved" as changes are
  written, so nobody wonders whether a change stuck.

## Technical notes

- `electron/db/schema.sql`: three new tables with the same idempotent
  `IF OBJECT_ID … CREATE TABLE` pattern used by the rest of the file, so existing
  databases pick them up through the normal migration pass; they inherit `is_synced`,
  `sync_status`, `synced_at`, `pending_sync` and `temp_id` from the trailing loops.
- `electron/db/repo.cjs`: extend `TABLES` (ordered: suppliers → … → held_orders,
  stock_adjustments) and `CATALOGUE_TABLES`; add JSON column parsing for
  `held_orders.lines`/`coupon`; new `housekeep({ retentionDays })` that deletes
  `is_synced = 1 AND synced_at < cutoff` for transactional tables only, then rebuilds
  indexes. Existing `pendingRows`/`markSynced`/`toCloudRow` need no change.
- `electron/main.cjs`: after `createWindows()`, a `setTimeout(…, 8000)` housekeeping
  call guarded by try/catch, plus a temp-file sweep of `userData` (`*.tmp`, stale
  `pending-*` print spools, orphaned update partials) using `fs.promises` only.
- Retention setting stored with the other sync options; default 90 days, minimum 7.
- `src/routes/settings.visibility.tsx`, `settings.printer.tsx`, `settings.tax.tsx`:
  wrap groups in the existing `@/components/ui/accordion`; add a small shared
  `SaveIndicator` in `src/components/pos/settings/` driven by the existing
  `updateSettings` call so no new state library is needed.
- Tests: repo table ordering and housekeeping SQL guards (never deletes unsynced or
  recent rows); a settings validation unit test. No new dependencies.
- Version bump to 1.2.95.
