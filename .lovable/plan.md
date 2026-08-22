# Make "Server vs. shop data" findable, and the cashier-login SQL run guide

## 1. Why you can't see the comparison page

The page exists and works — it is the `data-comparison` tab of the System & general
hub, at `/settings/system?tab=data-comparison`. What's missing is every normal way of
getting there:

- It has **no card and no search entry** in the settings catalog (`src/lib/settings-catalog.tsx`),
  unlike its six sibling tabs (System status, Database health, Logic health, Security
  alerts, Data sync & audit, Inheritance) which all have one.
- Inside the settings workspace sheet the tab strip is hidden by design, so the only
  place the tab is listed is the strip on the full `/settings/system` page.

### Fix

- Add a catalog entry `data-comparison` — label "Server vs. shop data", blurb "Record
  counts here against the company server", category `diagnostics`, `to:
  "/settings/system?tab=data-comparison"`, `raw: true`, panel lazily loading
  `DataComparison` — matching exactly how `data-sync` is registered.
- No changes to the panel itself or to the routing; the tab already renders.

After this it appears as a card in Settings, in settings search, and in the sheet.

## 2. Cashier login — which SQL file to run, and where

The **cashier login feature does not require you to run anything on the cloud
database** — the cloud already has the columns. Files only matter for shop tills
installed from an older build.

### Windows till running Microsoft SQL Server

Run against the shop database (`POS_LOCAL`) in SSMS or `sqlcmd`, in this order —
folder `db/offline/migrations/`:

1. `20260822_0101_app_users.sql` — PIN hash, role, permissions, store, sync columns (required)
2. `20260822_0102_cashiers.sql` — roster mirror (required)
3. `20260822_0103_staff_roles.sql` — roles/permissions (required)
4. `20260822_0104_audit_logs.sql` — offline sign-in audit rows (required)
5. `20260822_0105_compare_indexes.sql` — speeds up the comparison page (optional)

```text
sqlcmd -S localhost\SQLEXPRESS -E -d POS_LOCAL -i 20260822_0101_app_users.sql
```

Alternative: re-running the full script `db/offline/pos-offline-sqlserver.sql` does the
same job — it only adds what is missing.

### Till with no SQL Server (built-in local database)

Folder `electron/db/migrations/`, same five tables: `0101_app_users.sql` …
`0105_compare_indexes.sql`, run against `local_pos_database.db`. A fresh install already
has them.

### Company server (self-hosted PostgreSQL only)

`supabase/sql/stage5/` — parity files. Not needed on the managed cloud database.

Every file is safe to run twice and never deletes anything.

## Technical notes

Only one code change in this plan: one new entry in `src/lib/settings-catalog.tsx`.
`src/lib/settings-groups.ts` already lists the tab, so nothing there changes.
