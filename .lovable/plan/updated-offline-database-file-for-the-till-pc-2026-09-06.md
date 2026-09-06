# Updated offline database file for the till PC

## What's wrong today

There are two Windows database scripts in the project and they no longer match:

- `database/schema.sql` — the master the app itself applies on start-up (66 tables)
- `db/offline/pos-offline-sqlserver.sql` — the file you run by hand in SQL Server (59 tables)

The hand-run file is missing ten tables that the app now needs:
approval requests, approval actions, approval log, status history, record edits,
shift cash counts, shift close events, shift reconciliations, shift variance
alerts, and stock count drafts. A till set up by hand ends up short of a till set
up by the app — so approvals, blind cash counts and shift close all fail offline.

## What I'll do

1. Rebuild `db/offline/pos-offline-sqlserver.sql` from the master so both files
   describe exactly the same database: same tables, same columns, same sync
   bookkeeping columns, same indexes.
2. Keep the parts only the hand-run file has: it creates the database and the
   login, and it keeps the three local-only tables (the sync queue, the local
   activity log and the store settings mirror).
3. Keep every statement guarded, so running the file on a machine that already
   has an older database only adds what is missing — nothing is dropped and no
   existing row is touched. It is both the fresh install and the upgrade.
4. Update `db/offline/README.md` with the current table list and the run
   instructions.
5. Add a check that fails the build if the two files ever drift apart again, so
   this cannot silently repeat.
6. Hand you the finished `.sql` file as a download in chat, ready to open in SQL
   Server Management Studio or run with `sqlcmd`.

## How you run it

```text
sqlcmd -S localhost\SQLEXPRESS -E -i pos-offline-sqlserver.sql
```

or open it in SQL Server Management Studio and press Execute. Then in the till:
System & Settings > Local Database, enter the server, database `POS_LOCAL`, the
login, and press Test connection.

## Technical notes

- Generation is a one-time transform of `database/schema.sql`: strip the
  app-only preamble, prepend the `CREATE DATABASE` / login bootstrap, append the
  local-only tables and indexes.
- Guards stay `IF OBJECT_ID(...) IS NULL` for tables and
  `IF COL_LENGTH(...) IS NULL` for columns, matching the existing style.
- The existing per-feature files under `db/offline/migrations/` stay as they are;
  the full file already supersedes them on a fresh machine.
- Version bumped with `node scripts/bump-version.cjs`.
