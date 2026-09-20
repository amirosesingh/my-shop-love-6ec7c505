# SQL Server migration — checkpoints 0–6

This report records the state of the repository after the requested stop at
checkpoint 6. Checkpoints 7 onward are intentionally not marked complete.

## Completed repository checkpoints

| Checkpoint | Result | Evidence |
| --- | --- | --- |
| 0 — baseline and safety | Complete | Architecture and dependency guards cover direct SQL Server, secure configuration, and prohibited legacy storage. |
| 1 — remove fallback persistence | Complete | Legacy offline database documentation, migrations, snapshot code, discovery handlers, and stale health-report references were removed or updated. Production-source audit finds no SQLite implementation, database-file packaging, SQL Browser, UDP 1434, named-instance, or network-scanning path. |
| 2 — direct backend dependencies | Complete in source | Exact `mssql@12.7.2`, `msnodesqlv8@5.5.0`, and `@electron/rebuild@4.2.0` are pinned. The production build unpacks the native ODBC module. |
| 3 — permissions and restart state | Complete in source | IPC classifications, guarded handlers, a time-limited administrator capability, explicit lock/adopt/unlock paths, and connection state reporting are present and tested. |
| 4 — connection wizard | Complete in source | The Windows-only seven-step wizard collects a pinned direct host/port, TLS/timeouts and credentials; tests, validation, database selection, migration, encrypted save/connect, and retention are represented in the UI. |
| 5 — schema, mapping, and migrations | Complete | Supabase registry generation creates 67 SQL Server domain tables and 1,033 columns, including columns introduced by later `ALTER TABLE` statements, constraints, and generated DDL. Controlled migration and catalog validation code are present. |
| 6 — controlled repositories and IPC | Complete | Renderer access is limited to guarded, allowlisted business operations and bounded snapshots. Writes use parameterized repository operations and transactions; no renderer-supplied SQL channel exists. |

## Validation completed

- `npm run logic:scan`
- `npm run lint`
- `npm test -- --run` — 106 test files, 629 tests passed
- `npm run verify:sqlserver-schema` — 67 tables verified
- `npm run verify:sync-registry` — 67 sync decisions verified
- `npm run build` — completed successfully
- `node --check` for Electron CommonJS sources

## Required live acceptance before release

The repository has no provisioned SQL Server endpoint, so the following require
a real non-production Windows SQL Server instance before these checkpoints can
be accepted as deployed behavior:

1. SQL authentication and Windows-integrated authentication against the exact
   host/port configuration.
2. Wizard test, migration, encrypted save, restart, reconnect, and disconnect.
3. Fresh-database migration and an upgrade from a representative existing
   database.
4. Packaged Electron native-driver rebuild and installer smoke test.

This historical checkpoint report is superseded for later work by
`reports/checkpoints-7-12.md`.
