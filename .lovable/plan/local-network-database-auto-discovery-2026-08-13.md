# Local Network Database Auto-Discovery

Adds one-click discovery of SQL Server instances on the shop's network from the desktop app, plus clearer connection diagnostics.

## What the user gets

- A "Scan local network" button beside the Server / instance field in Local database settings.
- While scanning: "Searching local network for database instances…" with a spinner (about 3 seconds).
- A results list showing host name / IP, instance name, TCP port and version, each with a "Select & connect" action that fills the Server, Port and Database fields and runs a connection test.
- If nothing is found, a short explanation (SQL Server Browser service off, or UDP 1434 blocked by the firewall) instead of an empty box.
- Failed tests keep showing the driver error code plus plain-language advice (already present, extended with ETIMEDOUT and firewall/TCP-IP wording).

## Technical plan

**New: `electron/db/discover.cjs` (main process)**
- Uses `dgram` to send the SQL Browser client packet `0x02` to `255.255.255.255:1434` and to each IPv4 interface's directed broadcast address (derived from `os.networkInterfaces()`), plus unicast to `127.0.0.1`.
- Collects replies for a ~3s window, parses the `ServerName;X;InstanceName;Y;IsClustered;…;tcp;PORT;;` payload into `{ address, serverName, instance, port, version }`, de-duplicates by `address\instance`.
- Loopback probe in parallel: `net.connect` TCP checks on `127.0.0.1` and `os.hostname()` at port 1433 (and any port learned from the UDP replies) to catch instances whose Browser service is stopped.
- Returns `{ ok: true, servers: [...] }`; never throws — socket errors become `{ ok: false, error, hint }`.

**IPC + bridge**
- `ipcMain.handle("pos:scan-network")` in `electron/main.cjs`, next to the existing `pos:test` handler.
- `electron/preload.cjs`: expose `scanLocalDatabases()` on the existing `window.pos` bridge (the surface the settings UI already uses), keeping the current channel naming.

**Types**
- `src/lib/local-db.ts`: add `DiscoveredDbServer` type and optional `scanNetwork?: () => Promise<{ ok: boolean; servers?: DiscoveredDbServer[]; error?: string; hint?: string }>` to `PosBridge`, with a helper `scanLocalDatabases()` that returns an empty result in the browser.

**UI**
- `src/components/pos/LocalDatabaseSettings.tsx`: scan button beside the Server field, loading state, and a results panel (server, instance, port, version + "Select & connect"). Selecting writes `server` as `HOST\INSTANCE` (or plain host), sets `port`, keeps the existing database name, then runs the existing test path.

**Connection handling (`electron/db/pool.cjs`)**
- Current `parseServerField` already splits `HOST\INSTANCE`, `HOST,PORT` and `tcp:` prefixes and sets `options.instanceName`; keep it and reuse it for discovered values.
- Widen the "local" rule so private-LAN addresses (10.x, 192.168.x, 172.16–31.x) also default to `encrypt: false` with `trustServerCertificate: true`, preventing self-signed handshake failures for a server on the shop LAN — today only true localhost gets that treatment.
- Add `ETIMEDOUT` (alias of the existing `ETIMEOUT`) and a firewall/TCP-IP hint to `describeSqlError`.
- Windows auth (msnodesqlv8 / NTLM fallback) and SQL login paths stay as they are.

No cloud/database schema changes; nothing changes for the browser or Android builds.
