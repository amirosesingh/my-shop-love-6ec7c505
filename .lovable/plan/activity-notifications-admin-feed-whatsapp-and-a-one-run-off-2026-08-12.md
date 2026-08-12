# Activity notifications (admin feed + WhatsApp) and a one-run offline SQL setup

## Part 1 — Event notifications

### What gets captured
A single event feed, written whenever one of these happens:

- Sign in / sign out (cashier PIN, supervisor, admin), including failed PIN attempts and lockouts
- Shift opened / shift closed (with variance) and X-report printed
- Sale completed, refund, void, manual discount above a set amount
- Cash drawer opened by hand
- Stock adjustment, transfer sent/received, purchase order finalised
- Staff account created / edited / deactivated, role or permission change
- Terminal activated / unpaired

Each event stores: type, severity (info / warning / critical), title, plain-English message, actor name and role, terminal, branch, and the related record id.

### Where it shows
- A **bell in the top bar next to the existing security shield**, admin and manager only, with an unread count, a dropdown of the latest events, and "mark all read".
- A full page at **Reports → Activity notifications** with filters by type, severity, branch, terminal, person and date range, plus CSV export.
- Live: new events appear within seconds (polling on the same interval pattern the security bell already uses) and pop a toast for critical ones.

### WhatsApp delivery
- New section under **System & Settings → Notifications**: master on/off, recipient numbers (multiple), and a per-event-type matrix choosing *in-app only*, *in-app + WhatsApp*, or *off*.
- Quiet hours and a "critical only" shortcut so admins are not messaged for every sale.
- Messages are queued through the existing WhatsApp queue, so a failed send retries instead of being lost, and each event row records whether WhatsApp went out.
- Events raised while offline are queued locally and flushed when the link returns.

## Part 2 — Offline SQL Server setup files

Deliverable: a numbered set of scripts in `db/offline/` plus a step-by-step guide, produced after scanning every table the app writes today so nothing is missing.

```text
db/offline/
  00_create_database_and_login.sql   database, login, user, permissions
  01_schema_core.sql                 products, categories, suppliers, members, tiers
  02_schema_transactions.sql         sales, sale items, tenders, refunds, holds
  03_schema_operations.sql           shifts, shift summaries, drawer logs, POs,
                                     transfers, stock adjustments, bookings
  04_schema_admin.sql                staff accounts, roles, permissions, terminals,
                                     settings, audit logs, notification events
  05_indexes_and_triggers.sql        sync indexes + updated_at / is_synced triggers
  06_seed_defaults.sql               default settings, roles, tax, numbering
  99_run_all.sql                     runs 00-06 in order (single-file option)
  SETUP.md                           step-by-step install guide
```

Every table keeps the sync block already used by the desktop build
(`id UNIQUEIDENTIFIER`, `branch_id`, `is_synced BIT`, `sync_status`,
`created_at`, `updated_at`) so the existing sync worker pushes and pulls
without changes. Scripts are re-runnable — no drops, no data loss.

`SETUP.md` covers: installing SQL Server Express, enabling TCP/IP and mixed
authentication, running the scripts with `sqlcmd` or Management Studio,
setting the login password, entering the connection in the POS Local Database
screen, testing the connection, a first-sync check, and a scheduled backup
command.

## Technical notes

- New cloud table `activity_events` (append-only, admin/manager read, RLS +
  grants) and a matching local SQL Server table, written through the existing
  audit/service-relay path so a till cannot forge or delete entries.
- Emission goes through one helper (`src/lib/activity-events.ts`) called from
  the existing choke points — `pos-auth.tsx`, `shift-close.ts`, `use-commit.ts`,
  drawer, stock and staff-admin modules — rather than scattered ad-hoc calls.
- WhatsApp fan-out runs server-side on insert so a closed terminal cannot skip it.
- The offline scripts are generated from the current cloud schema files in
  `supabase/sql/`, so column names match one-for-one with the cloud tables.