# Refreshed offline database files + single-instance Electron lock

## 1. Offline database schema brought up to date

The local database files were written before the recent features landed, so a
local SQL Server or SQLite copy cannot store everything the cloud now holds.

Missing from both local engines today: payment types, the split-tender ledger,
item activity log, product barcodes/categories/units, coupon campaigns and
issued vouchers, coupon events, drawer events, member verifications (OTP),
branch telemetry, terminal commands, WhatsApp queue, shift sessions, staff
accounts/roles, settings rows and the audit/activity logs.

### SQL Server — `db/offline/pos-offline-sqlserver.sql`
- Add the missing tables listed above, in dependency order, with the same
  column names and types as the cloud so rows round-trip unchanged.
- Every new table gets the sync columns already used elsewhere:
  `is_synced`, `sync_status`, `updated_at`, `row_version`, and `client_transaction_id`
  where a till can create the row offline.
- Add the local sync plumbing that only SQLite has today: `offline_sync_queue`
  (with DELETE allowed), `stock_delta_applied`, and a store/terminal-scoped
  `sync_metadata`.
- Keep the file idempotent (`IF NOT EXISTS` guards) so an existing branch
  database upgrades in place — no drops, no renames.

### SQLite — `electron/db/offline_sqlite_v2.sql`
- Same set of new mirror tables, matching column names, so the desktop's own
  engine and a SQL Server branch database stay interchangeable.
- Indexes on the lookup paths that matter offline: barcode, sku, member phone,
  sale bill number and created_at, queue `(status, created_at)`.

### Docs
- Update `db/offline/README.md` with the current table list and the "run this
  file again to upgrade" instruction.

## 2. Only one copy of the desktop app may run

In `electron/main.cjs`:

- Take a single-instance lock at startup. If another copy already holds it, the
  new process shows a message box — "This terminal is already running" with a
  short line explaining the till is open in another window — and exits without
  opening a window.
- The copy that already holds the lock reacts to the second launch by restoring
  and focusing its existing window (and un-minimising it), so a double-click on
  the shortcut brings the till forward instead of doing nothing.
- The customer display window is unaffected; it stays a second window of the
  same instance.

## Files touched

- `db/offline/pos-offline-sqlserver.sql`
- `electron/db/offline_sqlite_v2.sql`
- `db/offline/README.md`
- `electron/main.cjs`

No cloud/database migration is applied and no application behaviour changes
beyond the launch guard.
