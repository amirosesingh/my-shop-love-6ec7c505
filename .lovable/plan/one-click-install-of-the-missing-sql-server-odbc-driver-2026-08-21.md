# One-click install of the missing SQL Server ODBC driver

## Which driver is involved (context)

- SQL Server **login** connections use `mssql` on **tedious** — pure JavaScript over TCP, no driver install needed.
- **Windows Integrated** authentication uses `mssql/msnodesqlv8`, which needs a Microsoft **ODBC** driver present on the PC. `installedOdbcDrivers()` in `electron/db/pool.cjs` reads the ODBC registry key; when nothing usable is found the ladder fails immediately with code `EDRIVER`.
- That `EDRIVER` case is the only one this feature acts on. OLE DB is included in the catalogue but only offered when a future OLE DB path needs it.

## What gets built

### 1. Pinned driver catalogue
A new `electron/db/driver-catalog.json` (read at runtime, so it can be refreshed by an app update or an optional signed remote override) listing, per driver id:
`name`, `version`, official `https://download.microsoft.com/...` x64 `.msi` URL, `sha256`, size, and a `manualUrl` for the Microsoft download page.

Entries: ODBC Driver 18 for SQL Server, ODBC Driver 17 for SQL Server (older-encryption fallback), OLE DB Driver 19 for SQL Server.

Only `download.microsoft.com` / `go.microsoft.com` over HTTPS is accepted; any other host in the catalogue is refused before a byte is fetched.

### 2. Main-process installer (`electron/db/driver-install.cjs`)
Windows-only. Steps, each traced:

```text
resolve catalogue entry -> download to %TEMP%\pos-driver\<id>.msi (streamed, progress events)
  -> sha256 of the file on disk vs pinned value
  -> msiexec /i <path> /qn /norestart  (launched so Windows shows its own UAC prompt)
  -> read exit code -> re-run installedOdbcDrivers() -> delete the temp file
```

- Download uses the existing main-process `net.cjs` HTTP (proxy-safe, no CORS), reporting `{ phase: "download", percent }` to the renderer through a new `driver:progress` broadcast. The file is written to disk rather than passed through IPC as base64.
- Checksum is computed with `node:crypto` on the downloaded file. A mismatch deletes the file and returns `{ ok:false, code:"ECHECKSUM" }` — no install is attempted, ever.
- Elevation is the normal Windows UAC prompt; nothing suppresses or bypasses it. Silent refers only to the MSI's own UI.
- Exit codes are mapped: `0` success, `3010`/`1641` success but **restart required**, `1602` user cancelled the elevation/install, `1603`/other → raw code surfaced.
- One install at a time; a second request returns "an installation is already running".

### 3. IPC surface
- `driver:list` — catalogue plus what is currently installed.
- `driver:install` (id) — runs the flow above, returns `{ ok, code, exitCode, restartRequired, installed[] }`.
- `driver:progress` — broadcast for percent and phase.
- `driver:cancel` — abort an in-flight download (an MSI already running is left to Windows).
All wrapped in the existing `withTimeout` helper and exposed through `electron/preload.cjs`.

### 4. UI: the driver-missing popup gains "Install driver"
In `SqlConnectionModal.tsx` (and the same block reused in `LocalDatabaseSettings.tsx`), the `EDRIVER` tip becomes a small panel:

- Which driver is missing and which one will be installed (name + version).
- Primary button **Install driver automatically**, with the plain warning: *"Windows will ask for permission — approve the prompt to continue."*
- Progress line: `Downloading 42%` -> `Verifying download` -> `Installing… (approve the Windows prompt)` -> result.
- Secondary: **Download manually** (official page) and **Retry connection**, always available.
- On success the wizard re-reads the installed drivers and **automatically re-runs the handshake step** — no restart, unless the exit code says a restart is required, in which case it says so plainly and offers a Restart now button.

Failure messages, each distinct and non-fatal:
| Case | Message |
| --- | --- |
| Download failed | "Could not download the driver — check the internet or proxy." + retry + manual link |
| Checksum mismatch | Security warning: the file did not match Microsoft's expected fingerprint; install refused; manual link |
| UAC cancelled (1602) | "Installation was cancelled, the driver is still missing." + retry |
| Other exit code | "The installer stopped with code <n>." + manual instructions link |
| Not Windows / no catalogue entry | Button hidden, manual link only |

### 5. Logging
Every phase writes through the existing `logConnection`/`trace` pattern into the rotating `connection.log`: `driver.download.start/progress/end`, `driver.checksum` (expected vs actual prefix), `driver.install.start/end` with exit code, and the post-install driver list. No paths outside temp, no credentials.

### 6. Tests
`driver-install.cjs` takes injectable `download`, `hash` and `runInstaller` helpers so Vitest can drive: success, restart-required (3010), download failure, checksum mismatch, UAC cancel (1602), unknown exit code, non-Windows platform, and a rejected non-Microsoft URL. No real installer is ever run in CI.

## Security invariants

- Downloads only from the pinned official Microsoft HTTPS URL; any other host aborts.
- SHA256 verification is mandatory and has no override or "install anyway" path.
- The Windows elevation prompt is always shown and never bypassed.

## Files

- new: `electron/db/driver-install.cjs`, `electron/db/driver-catalog.json`, `src/lib/driver-install.ts`, tests
- changed: `electron/main.cjs` (IPC), `electron/preload.cjs` (bridge), `electron/db/pool.cjs` (cache reset after install, export refresh helper), `src/components/database/SqlConnectionModal.tsx`, `src/components/pos/LocalDatabaseSettings.tsx`

Version bumped and the feature noted in the master documentation. No schema, business-logic or cloud changes.
