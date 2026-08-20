# Remaining work on the connection wizard fix

The handshake fix itself is in place and verified: deadlines on every IPC channel, a bounded attempt ladder, cancellation, and the new Write verification step. Typecheck is clean and all 99 existing tests pass. Four items are still open.

## 1. Automated tests for the new paths

`src/lib/__tests__/local-db-connection.test.ts` covers the old flow only. Add cases for:
- `verifyLocalWrite()` with no desktop bridge — returns the "Windows desktop app only" result instead of throwing.
- `verifyLocalWrite()` when the bridge never settles — resolves as an `ETIMEOUT` failure rather than hanging.
- The wizard's stale-run guard: a result arriving after the dialog closed must not flip a step back to running or passed.

This is the piece that keeps the bug from coming back; nothing today would catch a regression.

## 2. A visible Stop button while a step is running

Cancellation currently only fires when the dialog closes. While the ladder walks its attempts every button is disabled, so an operator who wants out has to close the whole dialog. Add a Stop control next to the running step that calls the same cancel path and marks the step as stopped, not failed.

## 3. Version bump and release note

`package.json` is still on 1.3.10. Bump to 1.3.11 and record the connection changes in `docs/offline-database-fix-report.md` — the timeout ceilings, the cancel channel, and what Write verification actually proves.

## 4. Real-machine confirmation

Only a Windows till with SQL Server can confirm the handshake end to end. Worth walking through on the actual machine: Windows Integrated and SQL login, Browser service stopped, and a login with read-but-not-write rights (which should now fail cleanly at step 6 instead of reporting success).

## Technical notes

Files involved: `src/lib/__tests__/local-db-connection.test.ts` (new cases), `src/components/database/SqlConnectionModal.tsx` (Stop control), `package.json`, `docs/offline-database-fix-report.md`. No schema, backend, or business-logic changes.
