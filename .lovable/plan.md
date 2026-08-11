# Fix "local database not connected" in the installed desktop app

## What is actually wrong

In the packaged Windows app the till never opens a connection to the local SQL Server on start-up.

The desktop shell only connects when someone opens Settings → Local database and presses **Connect** (`src/components/pos/LocalDatabaseSettings.tsx:153`). Nothing calls that on launch, so after every restart the main process pool is empty and every local read/write fails with "Local database is not connected" (`electron/db/pool.cjs:100`). On the web there is no local database at all, so the same features simply use the central database and appear to work — that is why it looks like "works in web, not in Electron".

Two further gaps make it worse:
- The saved connection details live only in the renderer's sealed browser storage, so the main process cannot reconnect on its own.
- When the connection drops (SQL Server restart, machine sleep, network share), nothing retries; the app stays broken until a manual Connect.

## The fix

1. **Remember the connection in the shell, not just the browser.**
   Store the local database settings in the existing sealed main-process store (same mechanism as the terminal token, `electron/terminal-store.cjs`) when they are saved from Settings, keeping the current encrypted browser copy as a fallback for a first upgrade.

2. **Connect automatically at start-up.**
   On app ready, load the saved settings and open the pool (apply schema, start the sync worker) before the window finishes loading. If none are saved yet, stay disconnected quietly and prompt in Settings instead of erroring on every action.

3. **Keep it connected.**
   Add a small supervisor in the main process: if a query fails because the pool is gone, or a periodic ping fails, reconnect in the background with a backoff, and broadcast the connected/disconnected state to the app so the status pill and the notification guard already in `src/lib/connection-health.ts` reflect reality.

4. **Say what is wrong when it genuinely fails.**
   Surface the real reason once (driver missing, Windows authentication unavailable, wrong instance name, SQL Server not running, login failed) in a single banner with a Retry and an "Open local database settings" action, instead of a generic failure on every operation.

5. **Make the packaged build carry the driver.**
   Verify the native SQL Server driver ships unpacked in the installer and that a missing driver is reported as such rather than as "not connected", so a bad build is distinguishable from a bad configuration.

6. **Regression cover.**
   Tests for: start-up connects when settings exist; start-up stays quiet when they do not; a dropped pool reconnects; a driver-missing failure produces the driver message, not the generic one.

## Technical notes

- Files touched: `electron/main.cjs` (boot connect, supervisor, IPC), `electron/db/pool.cjs` (reconnect + typed failure reasons), new `electron/db/config-store.cjs`, `electron/preload.cjs` (expose saved config + connection state), `src/lib/local-db.ts` (read/write through the shell store first), `src/components/pos/LocalDatabaseSettings.tsx` (status + retry), `src/lib/connection-health.ts` (use the broadcast state instead of only polling).
- No changes to the central database schema, routing rules, or the web build's behaviour.
