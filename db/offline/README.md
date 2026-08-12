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

Branches (`stores`), device settings (`system_settings`), products, members and
tiers, sales and sale items, purchase orders and their items, promotions,
shifts, day-end shift summaries, activity notifications (`activity_events`),
bookings and booking payments, transfers and stock transfers with their items,
suppliers, stock adjustments, held orders, audit logs, POS settings, and the
`sync_state` bookkeeping table.

Every table carries `is_synced` / `sync_status`, a computed `pending_sync`
flag, `temp_id` and `synced_at`, plus the indexes and touch triggers the sync
engine relies on, so pending rows upload automatically once the link returns.

## Upgrading a till installed with an older build

Run the same file again. It only adds what is missing — existing rows are never
touched — and it retires the obsolete `BranchSales` / `BranchSaleItems` views
from the first offline release.
