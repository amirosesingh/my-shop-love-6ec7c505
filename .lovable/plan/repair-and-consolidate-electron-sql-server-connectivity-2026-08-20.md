# Repair and consolidate Electron SQL Server connectivity

## Confirmed diagnosis

- The wizard’s error text is misleading. `SqlConnectionModal` converts any handshake timeout/socket wording into **“No answer on that port”**, even when the preceding TCP step already proved the port is open. An authentication, TLS, ODBC-driver, or named-instance timeout can therefore be reported as a firewall problem.
- Named instances are not handled consistently. When SQL Browser does not return the dynamic port, the raw socket probe falls back to port 1433, while the SQL driver may connect by `HOST\INSTANCE`. A raw port probe must not block a valid local named-instance connection.
- There are two pool states: the temporary administration pool and the operational POS pool. The header badge reads the administration pool, while Local Database settings reads the operational/sync status. This is why the header can say “connected” while the setup screen is not connected or has failed.
- Database configuration is also persisted through more than one path. The encrypted OS store is preferred, but a second general config copy is still written and used as a fallback.
- The app version is `1.3.11`, while the root version in `package-lock.json` is stale at `1.0.12`.

## Implementation

### 1. Make the SQL driver handshake authoritative
- Keep one shared connection engine in `electron/db/pool.cjs` for target parsing, named-instance resolution, Windows/SQL authentication, ODBC selection, TLS retries, timeouts, verification, and diagnostics.
- Change the TCP check into advisory diagnostics rather than a hard gate for `HOST\INSTANCE` when no explicit port is supplied. If SQL Browser returns a port, probe that port; otherwise let the driver resolve the named instance directly.
- Do not silently treat the default UI value `1433` as the port of a named instance. Preserve the distinction between an explicitly entered port and an unknown/dynamic port.
- Return structured failure stages (`port`, `instance_lookup`, `driver`, `tls`, `login`, `database`, `write`) and the resolved target so the renderer reports the real failure.

### 2. Remove the false firewall diagnosis
- Stop `tipFor()` from replacing handshake diagnostics with the generic port/firewall message.
- Show “port unavailable” only when the TCP probe itself fails against a known/explicit port.
- For handshake failures, preserve the main-process code and show specific guidance for missing ODBC driver, Windows-login rejection, SQL-login rejection, TLS/certificate mismatch, named-instance lookup, or sign-in timeout.
- Keep passwords and complete connection strings out of logs and UI diagnostics.

### 3. One operational connection authority
- Keep the administration pool only as an isolated, temporary Database Explorer session; it will no longer represent whether the till is connected.
- Make the operational pool (`pos:*`) the single authority for saved connection, startup reconnect, sales, sync, write verification, and all “database connected” UI.
- Replace/remove the header’s `SqlAdminBadge` status source and drive the header plus Local Database settings from the same operational status/event stream.
- Ensure completing the wizard closes or relinquishes the temporary admin session after the operational pool passes database and write verification.
- Rename visible statuses clearly: **Branch SQL Server** for the operational database, **Database Explorer session** for the temporary admin connection, and **offline mirror** for SQLite/browser storage.

### 4. Consolidate configuration persistence
- Use the OS-encrypted SQL configuration store as the canonical Electron source for automatic reconnect.
- Migrate an existing legacy general-config copy once, then remove that duplicate fallback/write path so credentials cannot drift between stores.
- Keep renderer-side values only for the active wizard form; do not treat browser storage or the SQLite mirror as connection authority.

### 5. Wizard and reconnect behavior
- Load the currently verified operational status when opening settings, so an already connected database is shown immediately.
- Run the sequence as: credentials → optional reachability diagnostic → driver authentication → catalog → operational connect/save → transactional write verification.
- A failed retry must not leave either the header or settings showing stale success; a successful reconnect must update both immediately.
- Preserve cancellation, overall deadlines, and stale-run protection already present.

### 6. Tests and version
- Add tests for a named instance with SQL Browser available, Browser unavailable with driver instance lookup, explicit non-1433 port, TCP success followed by login/TLS failure, missing Windows ODBC driver, and successful operational write verification.
- Add status tests proving the header and settings cannot disagree and that an admin Explorer session never marks the POS operational database connected.
- Add migration tests for the legacy duplicate config and verify secrets never appear in diagnostics.
- Update the release version to `1.3.12` consistently in `package.json`, generated `src/version.ts`, and the root lockfile metadata; document the connection consolidation.

## Validation

- Run the focused Electron connection/status tests and the full Vitest suite.
- Validate Electron modules load and IPC contracts remain aligned with preload types.
- On Windows, verify both Windows Integrated and SQL login against: default instance, `SQLEXPRESS`/named instance, Browser stopped, explicit fixed port, invalid credentials, and read-only login.