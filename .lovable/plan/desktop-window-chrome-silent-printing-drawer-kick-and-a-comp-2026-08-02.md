# Desktop window chrome, silent printing, drawer kick, and a compact till layout

Four separate changes, all desktop-aware: the web app keeps behaving exactly as it does today, the Electron build gets the native-feeling behaviour.

## 1. Frameless Electron window with real Windows controls

- Create the main window with `titleBarStyle: 'hidden'` plus `titleBarOverlay` (colours matched to the app background). Windows then draws the real minimize / maximize / close buttons in the top-right over our own header — no separate OS title bar, no custom buttons to maintain.
- Add an app-region drag strip in the header so the window can still be moved: a thin draggable band across the top of the shell, rendered only when running in Electron, with buttons and inputs marked non-draggable.
- The customer-display window on the second monitor stays fullscreen/frameless as it is.
- In the browser the header renders unchanged — no drag strip, no reserved space for window controls.

## 2. Silent printing (no print dialog) in Electron

Today every receipt is written into a hidden iframe that calls `window.print()`, which is why Windows shows the printer chooser.

- Add a `print:silent` IPC channel in the Electron main process. It renders the receipt HTML in an offscreen `BrowserWindow` and calls `webContents.print({ silent: true, printBackground: true, deviceName })`, where `deviceName` is the configured receipt printer, or the system default when none is set.
- Expose it on the preload bridge as `window.pos.print(html)`.
- In `src/lib/pos-print.ts`, `printHtml` checks for that bridge first: if present, send the HTML for silent printing; otherwise fall back to the existing iframe + `window.print()` path used by the browser.
- Settings gains an optional receipt-printer field populated from `webContents.getPrintersAsync()`, with "System default" as the default choice.

## 3. Cash drawer opens without any print UI

`openCashDrawer` currently prints a tiny page containing the ESC/POS kick code, so it triggers the dialog too.

- Add a `print:raw` IPC channel that writes the raw ESC/POS pulse (`ESC p 0 25 250`) straight to the printer share/port on Windows — the drawers are wired to the printers over RJ jack, so the pulse through the printer is the correct path.
- `openCashDrawer()` uses that channel when running in Electron: no window, no dialog, the drawer just opens. In the browser it keeps the current fallback.
- The raw pulse reuses the same configured printer as receipts.

## 4. Narrow-window layout for the register

At small widths the register stacks and the cart / tender panel is pushed below the fold with no way to scroll to it.

- Under the large breakpoint the page itself still never scrolls, but the cart + totals + tender column becomes the scrollable region, so cash/card buttons are always reachable.
- Below that breakpoint the product grid collapses out of the main view; the register instead shows a prominent "Search / add product" button.
- That button opens the product browser as a dialog (search field, category filter, tap-to-add grid) which closes after adding, returning to the cart. At larger widths the current side-by-side layout is unchanged.

## Files touched

- `electron/main.cjs` — frameless window + title bar overlay, `print:silent` and `print:raw` handlers, printer enumeration
- `electron/preload.cjs` — expose the print bridge
- `src/lib/pos-print.ts` — desktop-aware `printHtml` and `openCashDrawer`
- `src/components/pos/AppShell.tsx` — drag strip / window-control spacing in Electron only
- `src/routes/index.tsx` — compact layout and product-search dialog
- existing settings page — receipt printer selection

No database, permission, or sync behaviour changes.