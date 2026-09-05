# Start fresh: clear all trading data, keep logins, staff and settings

## What gets cleared

Every record the shop has created while trading:

- Sales, sale lines, payments, refunds, held orders, drawer events
- Shifts, shift sessions, cash counts, close events, reconciliations, variance alerts
- Bookings and booking payments
- Products, categories, barcodes, units, suppliers, promotions
- Purchase orders and lines, stock transfers and lines, stock adjustments, stock counts, stock deltas
- Members, membership tiers, member verifications, coupon campaigns, issued vouchers, coupon events
- All logs and history: audit logs, activity events, item activity, record edits, status history, authorisation requests/actions/log, SKU audit, security findings, sync audit, WhatsApp queue, telemetry

## What survives

- All login accounts (untouched — nothing in the accounts area is deleted)
- Staff profiles, roles and PINs
- Every setting: receipts, tax, printers, rules, numbering, payment methods
- Branches, groups and registered terminals stay as they are, since staff and settings are attached to them

## How the reset is done

### 1. Central database

A single wipe run against the central database that empties the tables above in dependency order, leaving the structure, access rules and the kept tables intact. Counters (bill numbers, receipt numbers) are reset to their starting point so the first new sale begins at 1.

### 2. Files you run on each till

Two matching scripts added to the project so you can clear a till yourself:

- `supabase/sql/99_reset_data.sql` — the same wipe for any central/Supabase-style database
- `db/offline/99_reset_local_data.sql` — for a branch SQL Server database
- `electron/db/99_reset_local_sqlite.sql` — for the desktop's own local file

Each file starts with a warning comment, clears the same table list, and also empties the pending-sync queue and sync markers so a cleared till does not push old rows back up or think it is already up to date.

`supabase/sql/README.md` and `db/offline/README.md` get a short section explaining when and how to run them.

### 3. Safety

The wipe is a deliberate, one-off action: you must be signed in as an admin and confirm by typing RESET before it runs. The scripts themselves carry the same warning at the top.

## Order of work

1. Confirm the exact keep/clear table split against the live database before anything is deleted.
2. Run the central wipe.
3. Add the three script files and the README notes.
4. Bump the version.
