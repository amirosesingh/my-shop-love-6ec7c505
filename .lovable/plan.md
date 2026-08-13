# Fix desktop SQL Server connection + sync status table

## What is wrong today

Audited `electron/db/pool.cjs`, `electron/db/repo.cjs`, `electron/sync/worker.cjs`, the IPC layer in `electron/main.cjs`, and the UI in `src/components/pos/LocalDatabaseSettings.tsx`.

Confirmed issues:

- `toDriverConfig` passes the whole server string straight through. `localhost\SQLEXPRESS` is never split into `server` + `options.instanceName`, so named instances cannot resolve.
- Encryption is driven only by `config.encrypt` and there is no connect/request timeout, so a stopped SQL Server hangs instead of failing fast.
- Windows auth requires `msnodesqlv8` and errors out otherwise; there is no `tedious` NTLM path and no connection-string fallback.
- `pos:test` returns `fail(err)` which is `{ ok:false, error: err.message }` only — `code` and `originalError` are dropped, so the UI shows a vague message.
- The status table shows only per-table counts. There is no row-level view, no failure reason (only a single global `last_error` in `sync_state`), no colour badges, and retry is one global button, not per row.
- Status does refresh over `pos:status-changed`, but `worker.run()` only notifies at the end of push/pull, so a "Sync Now" shows no intermediate state.

## Plan

### 1. Connection handling (`electron/db/pool.cjs`)

- Parse the server field: split on `\`, set `server` to the host and `options.instanceName` to the instance; strip a trailing `,port` into `port`. When an instance name is present, omit the fixed port so SQL Browser (UDP 1434) resolves the dynamic port.
- Add `options.trustServerCertificate = true`, `options.encrypt` defaulting to false for local instances, `connectionTimeout` and `requestTimeout` of 15s so failures surface quickly instead of hanging.
- Windows auth: keep `msnodesqlv8` as the preferred path (build a proper `Trusted_Connection=yes` connection string including the instance name), and fall back to `tedious` `authentication: { type: 'ntlm' }` with domain/user/password when the native driver is not installed, instead of hard-failing.
- Keep the SQL-login path, with explicit user/password.

### 2. Diagnostic errors

- Add a `describeSqlError(err)` helper returning `{ message, code, originalMessage, hint }` where `hint` translates common codes into plain language (`ELOGIN` wrong credentials, `ESOCKET` service/port unreachable, `ETIMEDOUT` firewall or SQL Browser off, `EINSTLOOKUP` instance not found).
- `pos:test` and `pos:connect` return that object; the Test Connection UI shows code + reason + hint, plus the server version on success.

### 3. Sync status table

- `repo.js`: add a `sync_error` column (idempotent `ALTER` in `schema.sql`) written by `markFailed`, and a new `failedRows(limit)` query returning table, id, status, attempts, error, updated_at. Add `retryRow(table, id)`.
- Worker: emit status on entry to push/pull (`syncing`), on each table completion, and at the end — so the UI moves in real time. Expose `phase` in `status()`.
- New IPC `pos:retry-row` plus preload binding `retryRow(table, id)`.
- UI (`LocalDatabaseSettings.tsx`): keep the per-table counts, add a rows panel listing failed/pending rows with colour-coded badges (green synced, amber waiting, red failed), the error text in a tooltip, and a per-row Retry button. Live updates come from the existing `onStatus` subscription.

## Verification

- Test with `localhost\SQLEXPRESS` + Windows account, and with a SQL login.
- Stop the SQL service and confirm the failure returns a code and a readable reason within ~15s.
- Trigger a sync and confirm the table changes state without a page refresh.
