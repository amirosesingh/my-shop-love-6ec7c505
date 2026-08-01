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
