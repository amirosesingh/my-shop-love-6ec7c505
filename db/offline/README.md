# Offline database (Microsoft SQL Server)

`pos-offline-sqlserver.sql` builds the local database the Windows till uses
when the internet is down. It is safe to run again at any time.

## 1. Install SQL Server

Install **SQL Server Express** (free) on the till PC and, optionally, SQL
Server Management Studio. Note the instance name, usually
`localhost\SQLEXPRESS`.

## 2. Run the script

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
