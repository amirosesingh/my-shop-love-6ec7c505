# Stage 3 — Auto-close the customer display when the POS closes

Today the customer-facing screen can outlive the till. In the desktop app the second-monitor window is created alongside the main window but nothing closes it when the till window is closed, so the app keeps running with only a customer screen visible. In the browser/popup case, the display is opened with `window.open` and stays open after the till tab is closed or navigated away.

## What will change

1. **Desktop (Electron)**
   - When the main till window closes (title-bar close button or OS close), the customer display window is closed first, then the app shuts down normally.
   - Closing the customer display on its own does not close the till.
   - Safe mode / recovery and quit paths also destroy the display window so no orphan full-screen window is left on the second monitor.

2. **Browser / popup display**
   - The till keeps a handle to the popup it opened and closes it when the till page unloads.
   - As a backstop that also covers popups opened before a refresh, the till broadcasts a "shutdown" message on the existing customer-display channel when it unloads; any open `/display` window receives it and closes itself (or shows an idle "Till closed" state if the browser blocks `window.close()`).

3. **Idle safety**
   - If the display stops receiving heartbeats/snapshots from the till for a short grace period, it drops to the idle screen instead of leaving a stale cart on show to customers.

## Technical notes

- `electron/main.cjs`: add a `mainWindow.on("closed", ...)` handler that closes/destroys `displayWindow`; clear `displayWindow` in its own `closed` handler; include display teardown in `enterSafeMode` and the quit path.
- `src/lib/customer-display.ts`: store the popup reference returned by `openCustomerDisplay`, add `closeCustomerDisplay()` and a `shutdown` message type on `DISPLAY_CHANNEL` (plus a `localStorage` mirror so cross-tab still works when BroadcastChannel is unavailable).
- Till shell (`AppShell.tsx`) registers a `pagehide`/`beforeunload` listener that calls the shutdown broadcast and closes the popup.
- `src/routes/display.tsx`: handle the `shutdown` message by attempting `window.close()`, falling back to an idle "Till closed" panel; add the snapshot-staleness timer that resets to idle.

No database or backend changes in this stage.
