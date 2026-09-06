# Offline database (Microsoft SQL Server)

`pos-offline-sqlserver.sql` builds the local database the Windows till uses
when the internet is down. It is safe to run again at any time.

## 1. Install SQL Server

Install **SQL Server Express** (free) on the till PC and, optionally, SQL
Server Management Studio. Note the instance name, usually
`localhost\SQLEXPRESS`.

## 2. Run the script

This file and `database/schema.sql` are **Microsoft SQL Server** scripts. Do not
run either one in MySQL or in the central PostgreSQL SQL editor. The preferred
upgrade method is **POS → Settings → Database & Cloud Connection → Schema
Manager → Local SQL Server**, where tables can be checked and repaired one by
one.

Command prompt:

```
sqlcmd -S localhost\SQLEXPRESS -E -i pos-offline-sqlserver.sql
```

Or open the file in Management Studio and press **Execute**.

Change the password near the top of the file (`ChangeMe_Str0ng!`) before
running it. Make sure **SQL Server authentication** and the **TCP/IP**
protocol are enabled in SQL Server Configuration Manager if the till and the
database are on different machines.

## 3. Connect the POS

In the POS: **System & Settings → Local Database**

| Field | Value |
| --- | --- |
| Server | `localhost\SQLEXPRESS` |
| Database | `POS_LOCAL` |
| User | `pos_local` |
| Password | the password you set in step 2 |

Press **Test connection**, then **Save**. The connection details are sealed
with the machine key, so they cannot be read or edited outside the app.

## What it creates

Branches (`stores`), device settings (`system_settings`), products with their
extra barcodes, categories and units, members and tiers, sales and sale items,
the split-tender ledger (`payment_transactions`) and the tender types behind it
(`payment_types`), purchase orders and their items, promotions, shifts and
shift sign-ins (`shift_sessions`), day-end shift summaries, bookings and
booking payments, transfers and stock transfers with their items, suppliers,
stock adjustments and the unified stock trail (`item_activity_logs`), held
orders, coupon campaigns, issued vouchers and coupon events, cash drawer opens,
member OTP verifications, staff accounts and roles so PIN sign-in works with no
network, terminal health (`branch_telemetry`) and remote commands
(`terminal_commands`), the outbound WhatsApp queue, activity notifications and
audit logs, POS settings, and the sync bookkeeping tables (`sync_state`,
`offline_sync_queue`, `stock_delta_applied`, `sync_metadata`).

Every table carries `is_synced` / `sync_status`, a computed `pending_sync`
flag, `temp_id` and `synced_at`, plus the indexes and touch triggers the sync
engine relies on, so pending rows upload automatically once the link returns.

## Upgrading a till installed with an older build

Run the same file again. It only adds what is missing — existing rows are never
touched — and it retires the obsolete `BranchSales` / `BranchSaleItems` views
from the first offline release.

## Tills without SQL Server

A till with no SQL Server installed uses the app's own local database
(`electron/db/offline_sqlite_v2.sql`, stored as `local_pos_database.db`). It
holds the same tables with the same column names, so a branch can move between
the two engines without changing anything in the POS.

## How this file is produced

`pos-offline-sqlserver.sql` is **generated**, never edited by hand:

```
npm run offline:sql          # rebuild the file
npm run offline:sql:check    # fail if it has fallen behind
```

It is stitched together from `db/offline/parts/00-bootstrap.sql` (create the
database, login and user), `database/schema.sql` (the master table set the app
itself applies — 66 tables) and `db/offline/parts/90-local-only.sql` (the two
tables that exist only on a till: `offline_sync_queue` and
`pos_store_settings`). 68 tables in total, so the till can hold everything the
central database holds.

Every table is guarded with `IF OBJECT_ID(...) IS NULL` and every column with
`IF COL_LENGTH(...) IS NULL ALTER TABLE ... ADD`, so a branch database installed
months ago gains the newer tables and columns in place. Nothing is dropped,
emptied or recreated, and the file can be run again at any time.

A test (`src/lib/__tests__/offline-sqlserver-file.test.ts`) fails the build if a
new table lands in `database/schema.sql` without this file being rebuilt.

The cloud counterpart is `supabase/schema.sql`: one file that installs the whole
Postgres schema on an empty project and tops up a live one, including grants,
row-level security and every policy and routine.

Central repairs use a different SQL dialect. In the Schema Manager choose
**Download central PostgreSQL repair script**, review it, and run it in the
external central project's SQL editor. Never run the downloaded central script
in SQL Server Management Studio, and never run `database/schema.sql` centrally.

## Starting fresh — `99_reset_local_data.sql`

`99_reset_local_data.sql` empties this branch database of every trading record
so the till can start from zero, keeping staff, settings, the store and its
registered terminals. It also empties the pending-sync queue and the "last
synced" markers, so a cleared till neither pushes old rows up nor believes it is
already up to date.

Destructive, no undo — back the database up first, and clear the central
database (`supabase/sql/99_reset_data.sql`) before running this. The desktop's
own SQLite file has its own copy: `electron/db/99_reset_local_sqlite.sql`.
