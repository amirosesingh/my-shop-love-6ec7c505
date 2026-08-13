# Local SQL Server 2025 Connection Wizard

## What exists today (verified)
- `electron/db/pool.cjs` already parses `HOST\INSTANCE,port`, builds tedious/msnodesqlv8 configs, and exposes `test(config)` returning version + server name.
- `electron/db/discover.cjs` finds instances over UDP 1434 broadcast plus a localhost TCP probe — but it does **not** read the Windows registry, so instances with the Browser service stopped on this PC can be missed.
- `electron/db-config-store.cjs` seals the config with `safeStorage` (OS vault). No `electron-store` involved.
- IPC lives in `electron/main.cjs` (`pos:test`, `pos:connect`, `pos:scan-network`), typed in `src/lib/local-db.ts`, and surfaced in `src/components/pos/LocalDatabaseSettings.tsx` (shadcn + Tailwind + Lucide).
So this is an extension, not a rewrite.

## Backend (Electron main)
1. Extend `electron/db/discover.cjs` with a local-registry probe:
   - `os.hostname()` plus `reg query "HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"` (Windows only, guarded, short timeout).
   - Emit a deduplicated target list: `127.0.0.1`, `localhost`, `HOSTNAME`, `HOSTNAME\INSTANCE`, merged with existing browser/TCP results and marked `source: "registry"`.
2. Add IPC `db:scan-local-instances` in `electron/main.cjs` returning `{ ok, hostname, targets[], servers[] }` (keeps `pos:scan-network` working for the existing LAN scan panel).
3. Add IPC `db:test-direct-connection`: accepts `{ host, port, database, authType, username, password, encrypt, trustServerCertificate, arithAbort, timeout }`, bypasses Browser lookup when a port is given, runs `SELECT 1 AS status, @@VERSION AS version, DB_NAME() AS activeDb`, and returns `{ ok, latencyMs, version, activeDb }` or the existing structured error (`code`, `hint`, `originalMessage`).
   - Requires small additions to `pool.cjs`: honour `trustServerCertificate` and `enableArithAbort` as real toggles instead of hardcoded `true`, and add a `testDirect()` that measures latency.
4. Expose both channels in `electron/preload.cjs` and type them in `src/lib/local-db.ts`; add `trustServerCertificate` and `arithAbort` to `LocalDbConfig` (defaults ON) so the sealed config carries them.

## Frontend
5. New `src/components/database/SqlConnectionModal.tsx` (shadcn Dialog, Select/Input, Switch, Badge, Lucide icons):
   - Header "Connect to Local SQL Server 2025" with an **Auto-Scan Local PC** button.
   - Editable server combo box populated from the scan (free typing allowed), port (default 1433), database (default `POS_Master_2025`, pre-filled from saved config when present).
   - Auth switch: Windows Integrated / SQL Server Authentication (credentials appear only for the latter).
   - Switches: Encrypt Connection (ON), Trust Server Certificate (ON), Enable ArithAbort (ON).
   - **Test Connection** shows a green badge with version + latency, or a red helper box with the driver error and an actionable tip (certificate, Browser service, firewall, port).
   - **Connect & Save** calls the existing `pos:connect`, which seals the config and initialises the pool.
6. On mount: run `db:scan-local-instances` and load the saved sealed config to pre-fill every field for one-click reconnect.
7. Wire the modal into `LocalDatabaseSettings.tsx` as the primary "Set up connection" entry point; the existing advanced fields and sync diagnostics stay untouched below it.

## Version
Bump `package.json` to **1.2.107**.

## Notes
Registry and direct-connect probes are Windows-only and no-op safely on other platforms and in the browser build, where the panel keeps its current "desktop only" message.
