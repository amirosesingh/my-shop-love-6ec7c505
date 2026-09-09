# Database upgrade

## Existing production Supabase

Run exactly one file in **Supabase Dashboard → SQL Editor → New Query**:

`supabase/sql/production_upgrade_current.sql`

It is transactional, additive, idempotent, and consolidates the current approval-authority and attention-related database requirements. Do not also run the individual represented migrations or the full canonical schemas when using this manual path. Supabase CLI deployments should continue using timestamped migrations normally.

## Existing Windows SQL Server till

Use **POS → Settings → Database & Cloud Connection → Schema Manager → Local SQL Server**. No manual SQL is normally required.

Technician fallback only: `db/offline/pos-offline-sqlserver.sql`.

Do not run `database/schema.sql` separately.

## Electron SQLite

Automatic; no manual SQL is required. Electron applies the guarded local schema during startup/upgrade. Never use a reset script for an upgrade.

## Fresh installation

Use the repository's existing canonical/fresh-install process. `supabase/schema.sql` and `supabase/retail_cloud_full.sql` are not production incremental upgrade files.
