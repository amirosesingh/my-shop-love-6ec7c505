# Windows desktop (Electron) conversion

The POS already runs offline-first in the browser (local state + outbox sync), so
the desktop shell only has to add a native window, a second monitor for the
customer display, raw ESC/POS printing, and an installer.

## 1. Why Electron (not Tauri)

The app uses TanStack Start SSR today. For desktop we ship the client build only
and let the Electron main process act as the "server" for native features
(printer, cash drawer, displays). Electron bundles Chromium, so rendering matches
what you test in the browser, and it has first-class raw-device support on Windows.

## 2. Steps

1. Build for `file://` loading: set `base: "./"` in the Vite config used for the
   desktop build and emit a static client bundle.
2. Add the shell (`electron/main.cjs`) with two `BrowserWindow`s: the till on the
   primary display and `/display` on the secondary one, auto-detected through
   `screen.getAllDisplays()`.
3. Native printing: expose an IPC channel that writes raw ESC/POS bytes to the
   shared printer (`\\localhost\ThermalPrinter`) so the cash-drawer kick code
   fires without a print dialog.
4. Local database (optional upgrade): the outbox persists to `localStorage`
   today. For multi-GB history, swap the `load` / `save` helpers in
   `src/lib/sync-outbox.ts` for `better-sqlite3` calls over IPC — nothing else in
   the app changes.
5. Package with `@electron/packager`:

   ```bash
   npm i -D electron @electron/packager
   npx vite build
   npx @electron/packager . "LovablePOS" --platform=win32 --arch=x64 --out=release --overwrite
   ```

6. Wrap the packaged folder with Inno Setup or NSIS for a double-click installer.

## 3. Sync rules on desktop

- All writes hit the local outbox first — the till never blocks on the network.
- The engine drains the queue in FIFO order and stops at the first failure, so a
  sale always lands before its `sale_items`.
- Conflict resolution: catalogue rows (products, members, promotions, settings)
  are last-write-wins upserts keyed on `id`; transactional rows (sales, sale
  items, purchase orders) are inserts with locally-minted UUIDs, so they can
  never overwrite cloud data. Operations still failing after 6 attempts are
  quarantined and surfaced in Settings -> Sync & backup to retry or discard.
- Settings -> Sync & backup also exports a full re-runnable SQL backup.

## 4. Terminal activation prerequisites

Activating a till calls three database helpers: `terminal_token_status`,
`terminal_token_claim`, and `terminal_token_heartbeat`. Databases set up before
single-use activation codes were introduced can have only some of these helpers,
and activation then fails with:

> This database is missing the terminal activation setup.

Fix it by running `supabase/schema15.sql` once in the **separate POS database
used to issue terminal tokens**. Do not run it against the app's Lovable Cloud
database. The script consolidates the current activation columns, status rule,
three functions, and their permissions. It is safe to re-run and does not
change or delete existing token rows. Activation codes issued earlier keep
working; there is no need to reissue them.

## Automatic updates

Build the installer with `npm run desktop:release` (NSIS, in-place updates).
The feed URL is baked into the installer from `POS_UPDATE_URL`; an installed
till can still be pointed elsewhere with `POS_UPDATE_FEED`:

```bat
:: plain web folder holding the installer + latest.yml (what we use)
set POS_UPDATE_URL=https://updatecms.luckycharmsdnbhd.com/pos-app/

:: runtime override, optional
set POS_UPDATE_FEED=https://updatecms.luckycharmsdnbhd.com/pos-app/

:: GitHub releases
set POS_UPDATE_FEED=github
set POS_UPDATE_REPO=your-org/your-repo
```

The till checks on launch and every 6 hours, downloads in the background, and
installs on restart (Settings → Software updates). The terminal
activation is mirrored to `terminal-config.json` in the app's user-data folder,
so an update never de-registers the machine.

## Building and publishing a release

1. One-time: in the GitHub repository, add a repository variable
   `POS_UPDATE_URL` (Settings → Secrets and variables → Actions → Variables)
   if you ever move the folder; builds already default to `https://updatecms.luckycharmsdnbhd.com/pos-app/`.
2. Bump `version` in `package.json`, commit, then push a matching tag:

   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```

   (Or run the **Desktop release (Windows .exe)** workflow manually.)
3. The Windows runner builds and publishes three files as a build artifact
   (and attaches them to the GitHub release for tag runs):

   - `LovablePOS Setup <version>.exe`
   - `latest.yml`
   - `LovablePOS Setup <version>.exe.blockmap`
4. Upload all three to your web folder, keeping the exact file names. The
   folder must be reachable over plain HTTPS with no login.
5. Every till picks the update up within 6 hours (or immediately via
   Settings → Software updates → Check for updates) and installs it on
   the next restart. Only the very first install needs the `.exe` to be
   copied to the machine by hand.

Builds are not code-signed yet, so the first install shows a Windows
SmartScreen prompt — choose **More info → Run anyway**. To sign later, add the
certificate as repository secrets and set `CSC_LINK` / `CSC_KEY_PASSWORD` in
the workflow's build step; nothing else changes.

## Re-issuing a terminal code

Settings → Terminal activation → **Re-issue code** on an existing row gives that
same counter a fresh activation code (old one stops working) without creating a
second entry. Requires `supabase/schema12.sql` to be run once.

## Safe mode and rollback

Each launch writes a pending marker; the till clears it once the register screen
mounts. A launch that crashes or hangs leaves the marker, and two failures in a
row open **safe mode** instead of the till:

- Automatic updates pause, so a broken build cannot reinstall itself.
- The recovery window shows the installed version, the last version that started
  cleanly, and the failure time, with **Roll back**, **Try starting again**,
  **Open log folder** and **Close**.
- Roll back downloads `<Product> Setup <version>.exe` for the last known-good
  version from the same feed (`POS_UPDATE_FEED`) and runs it silently.

The same window appears if the internal app server cannot start, so the machine
never dead-ends on an error box.

Recovery never touches `%APPDATA%\LovablePOS` — `terminal-config.json`,
settings and the local SQL Server data survive, so the till comes back
registered with no new activation code. The same rollback action is available
while the app runs from Settings → Software updates → System health.
