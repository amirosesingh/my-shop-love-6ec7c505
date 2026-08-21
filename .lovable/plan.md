# Phase 1 report — direct SQL-auth connection: what is actually happening

Investigation only. No code changed.

## 1. Why the handshake stalls even with ODBC 17/18 and OLE DB 19 installed

Good news first: with **SQL Server Authentication the ODBC drivers are not used at all**.
In `electron/db/pool.cjs` `planAttempts()`, the native path is chosen only when
`config.auth === "windows"`. For a SQL login it sets `native = false`, `drivers = [null]`, and every
attempt is built by `tediousConfig()` — pure JavaScript over TCP. So driver presence is irrelevant to
your path, and a driver-shaped error message here is misleading.

The stall comes from **port resolution, not authentication**:

- `parseServerField()` only marks a port "explicit" when it is typed inline (`HOST\INST,1435`) or
  passed separately as a non-zero port.
- The wizard's `resolvedPort()` in `SqlConnectionModal.tsx` (line ~307) deliberately **throws away a
  port of exactly 1433 whenever the server text contains a backslash**. So `localhost\SQLEXPRESS`
  with port 1433 is sent to the shell as "no port".
- With an instance name and no explicit port, `resolveTarget()` calls
  `discover.instancePort()` — a **SQL Server Browser UDP 1434 query**. If Browser is stopped it
  returns null after 1.5s.
- Step 2 (TCP socket) then **skips itself** (`probePort` returns `skipped: true, port: null`), so
  `provenPortRef` stays null and the handshake has no proven port to reuse.
- `planAttempts()` therefore adds the **instance-name route**, and tedious tries to resolve the
  instance over Browser itself. Each attempt burns the per-attempt deadline (10s), the ladder walks
  up to 4 combinations, and the 40s `LADDER_BUDGET_MS` expires → the step ends as `EBUDGET`/
  `ETIMEOUT`. That is exactly the "handshake hangs / times out" symptom.

Conclusion: it is not reaching a real login attempt at all in that configuration — it never gets a
socket to authenticate over. If a fixed port is typed inline (`localhost,1433`, no instance name),
the ladder goes straight to the port route and tedious signs in normally.

Code flagged: `resolvedPort()` in `SqlConnectionModal.tsx`; `parseServerField`/`resolveTarget`/
`planAttempts` in `pool.cjs`; the `skipped` branch of `probePort` in `admin-pool.cjs`.

## 2. The "connection already in progress" state on every launch

Nothing persists an attempt id or a lock. The state you see is a **live background retry loop in the
main process**, plus a UI label that reads like "busy".

- The saved credentials live in **one sealed file**: `<userData>/local-db-config.bin`, written by
  `electron/db-config-store.cjs` via `safeStorage`. (A legacy copy under `configStore.localDb` is
  migrated and cleared at boot.)
- At `app.ready` (`main.cjs` ~1323) the shell **auto-connects** to that saved config. On failure it
  calls `scheduleReconnect()`, which broadcasts `{ connected:false, reconnecting:true, attempt:n,
  nextRetryAt }` and retries with 5s→60s backoff **forever, as long as a config file exists**.
- `deriveLocalDbState()` in `src/lib/local-db.ts` maps "configured but not connected" to the
  `initializing` state with the text *"Trying to reach the saved database"* — which is what makes a
  fresh launch look like something else is already building a connection.
- In-memory only: `inFlight` in `admin-pool.cjs` and `pool`/`activeConfig` in `pool.cjs`. Both start
  empty in a new process, so they are **not** the cause. `inFlight` is also self-releasing
  (30s hard timer, and `connectInstance` supersedes a predecessor).
- There is no "Remove stored connection" entry in Local database settings; the only way to delete
  the sealed file is the **Forget connection** button inside the wizard footer
  (`pos:forget-connection`).

Code flagged: `main.cjs` boot auto-connect + `scheduleReconnect`/`broadcastReconnecting`;
`deriveLocalDbState` wording; `LocalDatabaseSettings.tsx` (no forget/remove action at that level).

## 3. "Reconnect now"

It is wired and it is not a no-op:

`SqlConnectionModal` / `LocalDatabaseSettings` → `reconnectLocalDatabase()` → `pos:reconnect` →
`reconnectNow()` in `main.cjs`, which cancels any admin attempt, disconnects the admin pool, closes
the operational pool, then calls `connectLocal(savedConfig)` with a 60s cap.

Why it looks dead:

- It reconnects with the **saved config only**. It ignores whatever the operator just typed in the
  wizard, so it repeats the same Browser-dependent resolution from #1 and stalls the same way.
- The saved config carries no `resolvedPort`, so the proven-port shortcut can never apply here.
- On failure it silently calls `scheduleReconnect()` and returns; the renderer shows a toast, but the
  wizard's step list is untouched, so the dialog still displays whatever it displayed before.
- If no config is saved it returns `ok:false, stage:"config"` immediately — nothing visibly happens.
- The renderer's own deadline is 70s while the main-process attempt caps at 60s, so a bad path
  produces a full minute of apparent silence.

Code flagged: `reconnectNow()` in `main.cjs`; `reconnectNow` handlers in `SqlConnectionModal.tsx`
and `LocalDatabaseSettings.tsx`.

## 4. Is SQL Server Browser in the active path?

Yes — and for your intended setup it should not be. Browser (UDP 1434) is touched in two places:

- `resolveTarget()` in `pool.cjs`, whenever an instance name is present and no explicit port is known.
- `probePort()` in `admin-pool.cjs`, which calls `resolveTarget` before probing.

Browser is genuinely required only to translate `HOST\INSTANCE` into a dynamic port. For a direct
`host,port` + SQL login it is entirely unnecessary: tedious opens TCP to that port and authenticates.
Today the wizard drags Browser into the path anyway because of the 1433-with-instance-name rule in
`resolvedPort()` and because the instance-name route is still queued as a fallback.

## Summary of code to change in Phase 2 (not changed yet)

| File | Issue |
| --- | --- |
| `src/components/database/SqlConnectionModal.tsx` | `resolvedPort()` discards an explicit 1433 for named instances; reconnect doesn't reset step state |
| `electron/db/pool.cjs` | `resolveTarget` does a Browser lookup even when a port is usable; instance-name route queued as fallback; budget consumed by Browser-bound attempts |
| `electron/db/admin-pool.cjs` | `probePort` skips the real probe for named instances instead of trying the supplied/1433 port first |
| `electron/main.cjs` | `reconnectNow` only uses the sealed config; boot auto-connect starts an unbounded retry loop that reads as "in progress" |
| `src/lib/local-db.ts` | `deriveLocalDbState` "initializing" wording; no exposed remove-stored-connection helper at settings level |
| `src/components/pos/LocalDatabaseSettings.tsx` | No "Remove stored connection" action |

Phase 2 will: expose and clear the stored connection, make Reconnect now supersede and retry with
the current form values, and let an explicit `server,port` + SQL login bypass SQL Browser entirely.
