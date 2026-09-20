# SQL Server migration — checkpoints 13–16

This report records the repository work after checkpoint 12. The Windows
`localDb` and `offlineFirst` rollout switches remain disabled until the
external release gate in checkpoint 16 passes against provisioned services.

## Checkpoint status

| Checkpoint | Result | Evidence |
| --- | --- | --- |
| 13 — historical receipt and refund fallback | Complete in source | Exact lookup accepts a receipt number, sale ID, or transaction ID. A local miss calls the authenticated relay with the signed-in session proof. The server enforces branch scope and `can_process_refund`; the Supabase routine returns the sale, items, and payment transactions. The full aggregate is materialized into SQL Server in one serializable transaction before the existing idempotent local refund runs. Offline historical misses return `EONLINE_REQUIRED`; local receipts remain usable. |
| 14 — health and telemetry | Complete in source | The Windows heartbeat now uses `/api/v1/pos/sync`, whose relay verifies the terminal and branch before a service-role upsert. It reports SQL Server state, database/schema version, sync phase, pending changes, conflicts, failed jobs, current table, last push/pull, application version, and signed-in/idle staff presence. Telemetry failures remain non-blocking. |
| 15 — database and sync operations UI | Complete in source | The Windows admin panel reports connection, latency, schema readiness, active job phase/table/rows/batch, sync phase, waiting rows, failures, conflicts, and last completion. It subscribes to database, job, and sync state; exposes guarded sync/pause/resume/reconcile and backup/restore actions; and presents readable outcomes instead of raw JSON. |
| 16 — release gate | Package/repository checks pass; live services pending | Lint, 108 test files/645 tests, 58 Electron/generator syntax checks, production and Windows installer builds, 67-table schema verification, 67-table sync verification, packaged native-driver loading, and merge-readiness checks pass. Enabling rollout still requires reconciliation/failure tests against real SQL Server and Supabase endpoints. |

## Files and schema

- Added `scripts/windows-package-smoke.cjs` and checkpoint 13–15 regression tests.
- Modified the receipt repository/bridge/UI, telemetry relay/agent, IPC policy,
  SQL Server generated schema and registry, Supabase schema, and database
  operations UI.
- Regenerated 67 SQL Server table mappings from 1,033 Supabase columns.
- Added ten telemetry columns for branch code, session and SQL Server state,
  database/schema identity, failures, sync phase/table, and push/pull times.
- Reused the existing cloud relay, registry mapping, serializable transaction,
  receipt refund, job, sync, health, and admin privilege infrastructure.
- No duplicate persistence layer, SQLite runtime, SQLite file fallback, raw SQL
  IPC, SQL Browser lookup, UDP discovery, or network scan was added.
- Electron Builder packages the vendor's N-API 8 Windows prebuild without a
  path-sensitive `node-gyp` rebuild, then unpacks it beside the ASAR.

## Validation completed

- `npm run lint`
- `npm test -- --run` — 108 files and 645 tests passed
- `npm run verify:sqlserver-schema` — 67 tables passed
- `npm run verify:sync-registry` — 67 decisions passed
- `npm run desktop:package` — produced `Retail Setup 1.3.193.exe`
- `npm run smoke:windows -- release\\win-unpacked` — packaged executable and native binding passed
- Packaged Electron loaded the `msnodesqlv8` N-API binding successfully
- `npm run build`
- Syntax validation for 58 Electron/generator CommonJS/ESM files
- `npm run verify:merge` and `git diff --check`

Failure-path coverage includes receipt lookup while offline, branch/refund
authorization, atomic historical materialization, inbound rollback without
cursor advance, exact outbound replay after lost acknowledgement, conflict
preservation, bootstrap resume, retention protection, and bounded million-row
job processing.

## External release gate

Checkpoint 16 is intentionally not marked deployed or enabled in source. Its
remaining acceptance needs credentials and endpoints absent from this
workspace: install/upgrade on a non-production Windows SQL Server, both SQL and
Windows authentication, interrupted bootstrap and restart, multi-terminal
conflict/replay, retention-gap recovery, reconciliation, timed million-row
transfer, uninstall/reinstall, and a Supabase-backed telemetry/receipt smoke
test. Keep both rollout flags disabled
until those results pass. Rollback is to disable the flags and return the till
to its existing cloud path; no SQLite fallback is involved.
