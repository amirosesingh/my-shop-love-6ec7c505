# Run the POS on your own Windows PC

Goal: get the app running locally in a browser first, then as a real desktop
window. The downloaded code is missing a few desktop-only pieces, which is why
you see warnings — the plan adds them and documents the exact commands.

## Why the warnings appear

- `package.json` has no `main` entry and no `electron` / `@electron/packager` /
  `mssql` dependencies, so `npx electron .` cannot find an entry point.
- `vite.config.ts` uses `base: '/'`, which loads fine in a browser but produces
  a blank window under `file://` in Electron.
- The `electron/` folder already exists (`main.cjs`, `preload.cjs`, `db/`,
  `sync/`) and is correct — it just isn't wired into the build yet.
- Ordinary `npm WARN deprecated ...` lines during install are noise, not errors,
  and can be ignored.

## Step 1 — Browser dev run (verify first)

Add a `docs/run-locally.md` covering:

- Prerequisites: Node.js 20+ LTS on Windows, plus the `.env` file (it ships with
  the project and holds the backend URL and publishable key).
- Commands: `npm install`, then `npm run dev`, then open the printed
  `http://localhost:8080`.
- Expected warnings and what to ignore, plus fixes for the common ones:
  `'vite' is not recognized` (install did not finish), port already in use,
  and PowerShell script-execution policy blocking `npm.ps1`.

## Step 2 — Desktop shell wiring

- Add `"main": "electron/main.cjs"` to `package.json`.
- Add scripts: `desktop:dev` (runs Electron against the dev server via
  `VITE_DEV_SERVER_URL`), `desktop:build` (Vite build then Electron), and
  `desktop:package` (@electron/packager for win32/x64).
- Add a desktop build mode to `vite.config.ts` that sets `base: './'` so
  `file://` asset paths resolve; the browser/cloud build keeps `base: '/'`.
- Document the installs the desktop shell needs: `electron`,
  `@electron/packager`, `mssql`, and `msnodesqlv8` for Windows integrated auth.

## Step 3 — Local database (optional at first)

The till runs without SQL Server: with no `window.pos` bridge it falls back to
local browser storage plus the outbox, so you can test the whole flow before
installing anything. When you want the real local database:

- Install SQL Server Express, enable TCP/IP, create an empty database.
- Enter the server, database, and auth mode in Settings -> Sync & backup ->
  Local database, then Test connection. Tables bootstrap on first connect.

## Step 4 — Installer

Document packaging the output folder with Inno Setup or NSIS for a
double-click installer, and note that `.exe` installers cannot be produced by
`@electron/packager` alone.

## Files touched

- `package.json` — `main` field and three desktop scripts
- `vite.config.ts` — `base: './'` for the desktop build mode only
- `docs/run-locally.md` — new step-by-step guide (browser + desktop)
- `docs/windows-sql-server.md` — refresh to match the new scripts

No application logic, UI, or backend behaviour changes.
