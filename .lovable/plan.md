# Fix "Cannot find module 'mssql'" when launching Electron

## What the error means

`electron/db/pool.cjs` does `require("mssql")` at the top of the file, and
`electron/main.cjs` requires that module while the app starts. `mssql` is not
listed in `package.json` dependencies, so it was never installed — Electron
aborts before the window opens. The stack you saw (`pool.cjs` -> `main.cjs`) is
exactly that chain.

Same trap waits behind it: Windows integrated auth needs `msnodesqlv8`, also
not installed.

## Fix

### 1. Declare the desktop dependencies

Add to `package.json`:

- `mssql` (dependencies) — the SQL Server driver
- `msnodesqlv8` (optionalDependencies) — only needed for Windows auth, and it
  compiles native code, so it must not break `npm install` on other machines
- `electron`, `@electron/packager`, `cross-env` (devDependencies) — already
  required by the desktop scripts but currently only documented

### 2. Make the driver load lazily so the app never dies at boot

Change `electron/db/pool.cjs` to require `mssql` inside the functions that
actually use it (`connect`, `test`), wrapped so a missing module returns a clear
message instead of crashing:

```text
Local database driver not installed. Run: npm install mssql
```

`electron/main.cjs` keeps registering IPC and opening the window; the till then
runs in its existing local-storage + outbox fallback mode, and only the
Local database section in Settings reports the problem. Same treatment for the
`msnodesqlv8` path: if Windows auth is selected and the driver is absent, the
returned error names the package to install.

### 3. Surface it in the UI

`src/components/pos/LocalDatabaseSettings.tsx` already renders the error string
from `pos:test` / `pos:connect`; the new messages flow through unchanged, so the
user sees the install command in the app instead of a console stack.

### 4. Docs

Update `docs/run-locally.md` and `docs/windows-sql-server.md`: after
`npm install`, `mssql` now comes with the project; `msnodesqlv8` is optional and
needs Visual Studio Build Tools on Windows if integrated auth is wanted.

## Files touched

- `package.json` — add mssql / msnodesqlv8 / electron toolchain entries
- `electron/db/pool.cjs` — lazy, guarded driver require
- `docs/run-locally.md`, `docs/windows-sql-server.md` — install notes

No UI, business logic or backend changes.
