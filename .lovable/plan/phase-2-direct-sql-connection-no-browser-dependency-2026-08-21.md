# Phase 2 — Direct SQL connection, no Browser dependency

Fixes the five confirmed Phase 1 issues. Driver selection (native only for Windows auth) is untouched.

## 1. Honour an explicit port on a named instance

`resolvedPort()` in the wizard currently drops a port of 1433 whenever the server text contains a
backslash, which is what pushes the shell into a SQL Browser lookup. A named instance and an explicit
port are not mutually exclusive.

- The wizard stops second-guessing the port: whatever is in the port field (or typed inline) is sent
  as explicit. The legacy "1433 was only a pre-fill" guess is replaced by the explicit Direct mode
  below, so the operator decides instead of a heuristic.
- `parseServerField` keeps its behaviour; `resolveTarget` only consults SQL Browser when the parsed
  target genuinely has no port at all.

## 2. Direct connection mode (server + port, no Browser)

A "Connection mode" control is added to the wizard and to Local database settings:

- **Direct (server, port)** — default when a port is present. Carried through the config as
  `directConnect: true`.
- **Automatic (resolve named instance)** — current behaviour, uses SQL Browser.

When direct mode is on:

- `resolveTarget()` returns `host, port, portKnown: true` immediately and never touches UDP 1434;
  the instance name is dropped from the target rather than used for lookup.
- `probePort()` in `admin-pool.cjs` always performs a real TCP probe on the given port instead of
  reporting `skipped` for named instances.
- `planAttempts()` builds only port-route attempts (no instance-name fallback), and the ladder budget
  is cut to the single-route case so a dead port surfaces `ETIMEOUT`, and a bad login `ELOGIN`,
  within seconds instead of after the 40s discovery budget.
- The failure block names the actual target tried (`host,port`, auth mode, encryption).

## 3. Remove saved connection

New "Remove saved connection" action in Local database settings, behind a confirmation dialog that
states stored credentials will be deleted.

- New IPC `pos:remove-connection` in `electron/main.cjs`: cancels any in-flight admin attempt, closes
  the admin and operational pools, **stops the reconnect backoff loop** (clears the timer and sets a
  suppression flag so `scheduleReconnect` cannot re-arm), then calls `dbConfigStore.write(null)`,
  which really unlinks `local-db-config.bin`.
- It broadcasts a final status with `configured: false, reconnecting: false`, so
  `deriveLocalDbState()` returns the clean `not_configured` state rather than
  "Trying to reach the saved database".
- `src/lib/local-db.ts` gains a typed `removeStoredConnection()` bridge helper with the usual IPC
  deadline.

## 4. Reconnect now uses the current form values

`reconnectNow()` accepts an optional config from the renderer.

- The wizard and the settings panel pass the current in-memory form values when the form is dirty;
  when untouched they pass nothing and the saved config is used, as today.
- A supplied config is used for the attempt only — it is persisted only after it succeeds, so a
  failed experiment cannot corrupt a working saved connection.
- `reconnectNow` clears any pending backoff timer before it starts, so retries never stack, and it
  resets the wizard's step list to a fresh run instead of leaving stale results on screen.

## 5. Honest reconnect banner

`scheduleReconnect()` keeps its 5s→60s backoff, but the broadcast now carries the last
`describeSqlError()` result (message, code and hint). `deriveLocalDbState()` renders that reason in
the banner — for example "SQL Server Browser did not answer for SQLEXPRESS; enter the port directly" —
instead of the static "Trying to reach the saved database." No credentials appear in the text.

## Files

| File | Change |
| --- | --- |
| `src/components/database/SqlConnectionModal.tsx` | port honoured, connection-mode control, reconnect with form values, step reset |
| `src/components/pos/LocalDatabaseSettings.tsx` | connection mode, Remove saved connection + confirmation, reason banner |
| `src/lib/local-db.ts` | `directConnect` on the config type, `removeStoredConnection()`, reconnect with overrides, banner reason in `deriveLocalDbState` |
| `electron/db/pool.cjs` | `resolveTarget` Browser bypass, direct-only `planAttempts`, shorter budget for the direct route |
| `electron/db/admin-pool.cjs` | `probePort` always probes a known port |
| `electron/main.cjs` | `pos:remove-connection`, suppressible `scheduleReconnect`, `reconnectNow(configOverride)`, error reason in broadcasts |
| `electron/db-config-store.cjs` | explicit `remove()` that unlinks the sealed file and reports the result |

## Tests (Vitest)

- `localhost\SQLEXPRESS,1433` resolves to a direct TCP attempt on 1433, with no Browser lookup.
- Direct mode never issues a UDP 1434 lookup, even with an instance name present.
- Remove saved connection: file deleted, retry loop stopped, state resets to `not_configured`.
- Reconnect now with unsaved edits uses the new values; untouched form uses the stored config.
- A failed direct attempt reports `ETIMEOUT`/`ELOGIN` well inside the old ladder budget.

Version bumps to 1.3.23. No schema, cloud or business-logic changes.
