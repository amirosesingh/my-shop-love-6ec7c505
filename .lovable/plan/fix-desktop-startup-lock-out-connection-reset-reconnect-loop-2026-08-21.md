# Fix desktop startup lock-out, connection reset, reconnect loop and the Step 3 handshake

## What I confirmed in the code

- **Startup screen is sticky by design flaw.** `health.beginBoot()` always writes `pending: true`. When `shouldEnterSafeMode()` is true, `main.cjs` opens the recovery window and returns — no window ever calls `app:ready`, so `pending` stays true, and the next launch counts *another* failure (`failures = prev.pending ? prev.failures + 1 : 0`). Once the till lands in recovery it can never leave it on its own, and `updater.pause()` keeps automatic updates off permanently. Nothing clears `pending` on the safe-mode path and nothing revalidates the record when the installed version changed.
- **"Reset Connection" never reconnects.** `pos:reset-connection` cancels the in-flight handshake, closes both pools, **clears the sealed credentials** (`dbConfigStore.write(null)`) and clears the reconnect timer. Since `scheduleReconnect()` refuses to run without a saved config, the till is left permanently disconnected. The renderer message the operator sees ("Restart the till if the connection stays stuck.") is the 15s IPC timeout text in `resetLocalDatabase()`.
- **Reconnect loop is silent.** On failure `main.cjs` broadcasts `{ connected: false, error }` and doubles the delay to 60s. The renderer's `deriveLocalDbState` shows "Reconnecting…" with no attempt count, no next-retry time and no manual retry, and there is no way to force an immediate attempt.
- **Step 3 runs out of budget rather than failing on a real cause.** For Windows auth the ladder is `installedOdbcDrivers()` (up to 5 names) x routes x 3 encryption combinations, each capped at `ATTEMPT_TIMEOUT_MS = 8s`, against `LADDER_BUDGET_MS = 25s`. Two or three attempts consume the whole budget and the result is `EBUDGET`/`ETIMEOUT` — exactly the "handshake did not finish in time" text. `installedOdbcDrivers()` also substring-matches the whole registry dump (so "SQL Server" matches any line) and silently falls back to *all* known driver names when the registry read fails.
- **The TCP step's result is thrown away.** `probePort` resolves the instance port, but for a named instance with no advertised port it returns `{ ok: true, skipped: true, port: null }`, and the wizard passes the *original* form values to the handshake — the driver then repeats the instance lookup that already failed.

## The fix

### 1. Boot health cannot lock the till out
- On the safe-mode boot path, clear `pending` immediately and record the failure once, so a launch in recovery never inflates the counter.
- Treat the record as version-scoped: a stored failure that belongs to a different version than the installed one no longer forces recovery. Out-of-range or unparseable values (`failures` negative/NaN, corrupt JSON) reset to a clean record instead of blocking startup.
- Resume automatic updates as soon as a launch reports ready, and add an explicit "Resume updates" action to the recovery screen.
- Keep the 60s ready watchdog, but count only one failure per launch and log the reason it fired.

### 2. Reset Connection actually resets
Split the single destructive handler into two intents, both exposed over IPC and in `src/lib/local-db.ts`:
- **Reconnect now** (the default button): cancel any in-flight handshake, close the admin and operational pools, re-open with the **saved** credentials, run the verify round-trip and broadcast the new status. No restart, credentials kept.
- **Forget saved connection** (confirmed, destructive): current behaviour, and it now leaves the wizard in a clean not-configured state.
Both return `{ ok, stage, error, hint }` so the UI can say what happened, and the reconnect backoff is restarted rather than cancelled.

### 3. Reconnect loop recovers and explains itself
- The broadcast status gains `reconnecting`, `attempt`, `nextRetryAt` and `lastError`, so the badge reads "Reconnecting — attempt 3, next try in 20s" with the real reason underneath instead of a bare spinner.
- Backoff 5s -> 10s -> 20s -> 40s -> 60s, capped, retrying indefinitely, and reset to 5s on any success or on a manual retry.
- Every attempt is bounded by a deadline in the main process so a hung driver cannot stall the loop.
- A "Retry now" control in Local Database settings and in the header badge fires an immediate attempt.

### 4. Step 3 completes instead of timing out
- **Driver detection:** parse the ODBC registry values line by line and keep only drivers actually installed, newest first. If Windows auth is selected and neither `msnodesqlv8` nor a usable ODBC driver is present, fail immediately with that named cause instead of burning the budget.
- **Use the proven port:** the TCP step returns the port it succeeded on (and, for a named instance, the port SQL Browser reported); the wizard forwards it to the handshake, which then connects by `host,port`. Instance-name resolution is only the last resort.
- **Shorter, smarter ladder:** at most four combinations — the operator's own setting, encryption on + trust certificate, encryption off, then the instance-name route — deduplicated, best first.
- **Aligned deadlines:** per attempt 10s, ladder budget 40s, main-process handshake ceiling 45s, renderer deadline 50s (today's 33s renderer deadline can fire before the shell has finished, which itself looks like a timeout).
- Encryption/TLS mismatch, a missing ODBC driver, mixed-mode authentication disabled, a stopped Browser service and a login without instance access each get their own message with the concrete Windows step to take.

### 5. TCP pre-flight always answers
- When Browser does not advertise a port, still probe the typed port and 1433 and report exactly what was tried, rather than skipping the step and letting the handshake fail vaguely.
- A failed probe blocks the handshake with the port/firewall message instead of letting Step 3 absorb the blame.

### 6. Diagnostics
Structured lines for every sub-step (driver load, target resolution, Browser lookup, socket, each ladder attempt with route/driver/encryption, identification query, catalogue query) go to the console and to a rotating `connection.log` in the app data folder, openable from Local Database settings. Never any credential values.

## Files touched

- `electron/health.cjs`, `electron/main.cjs`, `electron/recovery.html` / `recovery.cjs`, `electron/updater.cjs` — boot-health lifecycle, resume-updates
- `electron/db/pool.cjs` — driver detection, ladder shape, deadlines, logging
- `electron/db/admin-pool.cjs` — port hand-off, deadlines, diagnostics
- `electron/db/discover.cjs` — Browser lookup result surfaced to the caller
- `electron/main.cjs`, `electron/preload.cjs` — reconnect/forget handlers, richer status broadcast
- `src/lib/local-db.ts`, `src/lib/sql-admin.ts`, `src/lib/connection-attempt.ts` — new states, deadlines, types
- `src/components/database/SqlConnectionModal.tsx`, `src/components/pos/LocalDatabaseSettings.tsx`, `OperationalDatabaseBadge.tsx` — port hand-off, Reconnect/Forget, retry, live reconnect detail

No schema, business-logic or cloud changes. Version bumped and noted in the master documentation.

## Verification

- Unit tests: boot health never re-enters recovery from a cleared record; reconnect backoff sequence and reset-to-5s; ladder is capped at four attempts and stops at a login failure; renderer reset path returns a result instead of the timeout text.
- Manual on a Windows till: named instance with Browser stopped, Windows Integrated and SQL login, service stopped mid-session (expect automatic recovery), Reset with the service down then brought back up.
