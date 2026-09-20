# Central PostgreSQL / Supabase SQL

## Existing production database — current release

Run exactly one manual upgrade file:

`production_upgrade_current.sql`

It is the scoped, transactional, re-runnable upgrade for the current approval-authority and Needs Attention release. Do not also run its represented timestamped migrations or either full canonical schema when using this manual path.

## Automated deployments

`../migrations/` remains the authoritative migration history for Supabase CLI and automated deployment. Do not run individual migration files by hand when using the consolidated manual upgrade.

## Fresh installation

Use the repository's single full canonical schema process with `../schema.sql`. It is a fresh-install reference, not this release's incremental production upgrade.

## Windows and Electron

Windows SQL Server uses the controlled schema manager in `electron/db/migrations.cjs` with generated files in `database/sqlserver/`. These files must never be run in Supabase.

## Destructive maintenance

`99_reset_data.sql` deliberately empties trading data and is unrelated to upgrades. Never run it for deployment.
