# Running the POS on your own PC

Two stages: get it running in a browser first (fastest way to confirm the code
is fine), then wrap it in the Electron desktop window.

## 0. Prerequisites

- **Node.js 20 LTS or newer** — https://nodejs.org (the LTS installer).
  Check with `node -v` and `npm -v` in a new terminal.
- The `.env` file that ships in the project folder. It holds the backend URL and
  the publishable key. If it is missing, the app boots but cloud sync is off.
- Windows only: if PowerShell refuses to run `npm.ps1`
  (*"running scripts is disabled on this system"*), either use **Command
  Prompt** instead of PowerShell, or run once as administrator:

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

## 1. Browser dev run

```bash
cd path\to\the\project
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:8080).

### Warnings you can ignore

- `npm WARN deprecated ...` — transitive dependencies, harmless.
- `npm WARN EBADENGINE` — only matters if your Node is older than 20; upgrade.
- Peer-dependency warnings during install.
- Vite's "Re-optimizing dependencies" message on first start.

### Warnings you should act on

| Message | Fix |
| --- | --- |
| `'vite' is not recognized` / `Cannot find module` | `npm install` did not finish. Delete `node_modules` and re-run it. |
| `Port 8080 is in use` | `npm run dev -- --port 5175`, or close the other app. |
| `EACCES` / `EPERM` on Windows | Move the project out of OneDrive/Program Files into e.g. `C:\dev\pos`. |
| Blank page + console 404s on `/assets/...` | You opened a desktop build in a browser. Use `npm run dev`. |

## 2. Desktop (Electron) run

Install the desktop-only packages once:

```bash
npm install --save-dev electron @electron/packager cross-env
npm install mssql
# only for Windows integrated authentication against SQL Server:
npm install msnodesqlv8
```

Then either:

```bash
# A. live reload: leave `npm run dev` running in one terminal, then
npm run desktop:dev

# B. run the built app exactly as customers will see it
npm run desktop:build
```

The shell opens the till on the primary monitor and, if a second monitor is
attached, the customer display (`/display`) full-screen on it.

### Desktop warnings you can ignore

- `Electron Security Warning (Insecure Content-Security-Policy)` — only shown in
  development builds, never in the packaged app.
- Autofill / DevTools protocol errors in the console.
- GPU / `vulkan` / `dxgi` warnings on machines without a discrete GPU.

### Desktop problems worth fixing

| Symptom | Cause and fix |
| --- | --- |
| Blank white window | Built without `DESKTOP_BUILD=1`. Use `npm run desktop:build`. |
| `Unable to find Electron app` | `"main": "electron/main.cjs"` missing from `package.json`. |
| `Cannot find module 'mssql'` | Run `npm install mssql`. |
| `Cannot find module 'msnodesqlv8'` | Only needed for Windows auth; install it or switch the connection to a SQL login. |

## 3. Local SQL Server database (optional)

The till works without it — with no desktop database bridge it falls back to
local storage plus the sync outbox, so you can test the whole flow first.

When you want the real local database:

1. Install **SQL Server Express** and enable TCP/IP for the instance in SQL
   Server Configuration Manager, then restart the service.
2. Create an empty database (for example `LovablePOS`).
3. In the app: **Settings -> Sync & backup -> Local database** — enter server,
   database and auth mode, then **Test connection**. Tables are created
   automatically on first successful connect.

See `docs/windows-sql-server.md` for the schema and sync details.

## 4. Building an installer

```bash
npm run desktop:package
```

This produces `release\LovablePOS-win32-x64\` containing `LovablePOS.exe` —
copy that folder to any Windows PC and it runs, no Node.js required.

For a double-click setup wizard, wrap that folder with
[Inno Setup](https://jrsoftware.org/isinfo.php) or NSIS. `@electron/packager`
alone cannot produce an `.exe` installer, only the runnable folder.
