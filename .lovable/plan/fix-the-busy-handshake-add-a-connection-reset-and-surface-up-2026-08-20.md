# Fix the "Busy" handshake, add a connection reset, and surface updates in the header

## What I confirmed in the code

- `electron/db/admin-pool.cjs` keeps a single `inFlight` marker so only one handshake may run. `cancel()` sets `cancelled = true` but **never clears `inFlight`** — only the original `connectInstance` promise's `finally` clears it. So after a cancel (or after closing the wizard, which calls `cancel()` in the renderer), the marker stays set for as long as the old attempt keeps walking its ladder — up to the 25s budget, or indefinitely if a driver call never settles. Pressing "Run checks" in that window returns `EBUSY: A connection attempt is already running`.
- Windows Integrated is the mode that hits this most: it goes through the native ODBC path, which opens more combinations (driver list x encryption ladder) and is the one most likely to sit on a half-open socket, so the previous attempt is still alive when the operator retries.
- There is no way to clear a saved local SQL Server connection: `pos:connect` exists in `electron/main.cjs`, but no disconnect/reset handler, and `src/lib/local-db.ts` has no reset path.
- The header in `src/components/pos/AppShell.tsx` has a Settings icon button but no updates entry; software updates live only at `/settings/updates`.

## Fix

### 1. A cancel must actually free the slot
- `cancel()` clears `inFlight` immediately (after flagging the run cancelled) so the very next attempt can start; the abandoned run is tagged and its late result is discarded instead of touching the pool or session.
- `connectInstance` no longer refuses outright on a busy marker: it cancels the previous run, waits briefly for it to release, and then proceeds. `EBUSY` remains only for the genuine case of two attempts started within the same instant, and its text tells the operator to press Reset.
- Every attempt gets a hard overall deadline in the main process, so `inFlight` can never outlive the wizard: if the ladder exceeds the budget it is force-released and the pool torn down.
- Closing the wizard awaits the cancel before the dialog state resets, so re-opening always starts clean.

### 2. Make Windows Integrated recoverable
- When the native ODBC path is unavailable or every driver/encryption combination fails, report that plainly (missing "ODBC Driver 18 for SQL Server", Windows login not present on the instance) instead of a timeout, and keep the attempt list visible.
- Bound the Windows path with the same per-attempt deadline as the SQL path so it cannot leave work running after the step reports failure.

### 3. Reset connection
- New main-process handler that: cancels any in-flight attempt, closes both the administration pool and the operational pool, clears the encrypted saved connection, and broadcasts the new disconnected status.
- Exposed through preload and `src/lib/local-db.ts`.
- Surfaced in two places: a "Reset connection" button in the wizard footer (always enabled, even mid-run — this is the escape hatch from any stuck state) and in Local Database settings, with a confirmation because it forgets the saved credentials.
- After a reset the header badge and the settings screen both show disconnected immediately.

### 4. Software updates in the header
- Add an updates icon button next to the Settings icon in the app header, linking to `/settings/updates`, with a small dot when an update is ready to install so it is noticeable without opening Settings.
- Same treatment in both header layouts (compact and wide) that currently render the Settings button.

## Technical notes

- Files: `electron/db/admin-pool.cjs` (cancel/in-flight lifecycle), `electron/db/pool.cjs` (attempt deadline + Windows driver reporting), `electron/main.cjs` + `electron/preload.cjs` (reset handler), `src/lib/local-db.ts` and `src/lib/sql-admin.ts` (types + reset call), `src/components/database/SqlConnectionModal.tsx` (reset button, awaited cancel on close), the Local Database settings panel, and `src/components/pos/AppShell.tsx` (updates icon).
- Tests: cancel frees the slot for an immediate retry; a superseded run cannot write into current state; reset clears the saved config and reports disconnected.
- Version bumped to 1.3.13 in `package.json` and `src/version.ts`, with a note in `docs/offline-database-fix-report.md`.
