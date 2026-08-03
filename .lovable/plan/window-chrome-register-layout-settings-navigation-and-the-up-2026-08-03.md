# Window chrome, register layout, settings navigation and the updates tab

Four fixes: in-window minimize/maximize/close buttons, a register that never overlaps at small sizes, consistent settings pages with a back button everywhere, and a clearer updates tab with the version and a manual update.

## 1. Minimize / maximize / close inside the Electron window

Today Windows draws its own buttons over the title strip. Instead the app draws them itself, at the right end of the title bar, matching the app theme (light and dark):

- Minimize, maximize/restore (icon flips when the window is maximized) and close.
- Double-clicking the title strip still maximizes/restores; dragging still moves the window.
- Close asks for confirmation when a ticket has items on it, so a sale is not lost by a mis-click.
- The browser view is unchanged — the strip and buttons only appear in the desktop app.

## 2. Register no longer overlaps on a small window

The totals block (balance due, Charge, Book & pay later) currently gets squashed by the cart list and the bottom action deck when the window is short or narrow, so buttons sit on top of each other.

- Totals become a fixed footer of the ticket column that never shrinks; the item list takes the leftover space and scrolls.
- On narrow windows the right-hand deck (Hold, Void, Coupon, Split, Close shift, drawer) becomes a collapsible bar pinned under the totals instead of a tall panel competing for the same space, so nothing overlaps at any size.
- Charge and Book & pay later stay reachable without scrolling.
- Verified with a browser check at several window sizes, including a short window.

## 3. Settings pages: one consistent look, always a back button

- Every settings page uses the same page frame; the back button stays visible at the top even when the page is scrolled.
- The back link is smarter: it returns to where you came from when that was another in-app page, otherwise to the settings hub.
- The settings hub itself gets a back button to the register.
- Pages get grouped headings on the hub (Appearance, Receipts, Payments, System) so the list is easier to scan.

## 4. Updates tab: version and manual update

- Always shows the installed version, plus the newest version found and when the last check ran.
- Adds a manual "Download and install now" action so an update can be applied immediately instead of waiting for the background schedule or a restart.
- Shows the update folder the till is pointing at, so a misconfigured feed is obvious.
- In the browser (non-desktop) view the tab explains that updates apply to the installed Windows app instead of showing nothing.

## Technical notes

- `electron/main.cjs`: `frame: false` with `titleBarStyle: "hidden"` and no `titleBarOverlay`; add `window:minimize`, `window:maximize` (toggle), `window:close`, `window:is-maximized` IPC plus `maximize`/`unmaximize` events broadcast to the renderer. Expose them in `electron/preload.cjs`.
- New `src/components/pos/WindowControls.tsx` rendered in the `app-drag` strip in `AppShell.tsx` with `app-no-drag` on the buttons; the confirm-on-close check reads cart state.
- `src/routes/index.tsx`: add `shrink-0` to the totals footer, `min-h-0` on the ticket column, convert the right `aside` to a collapsible bottom bar below `lg`.
- `SettingsFrame.tsx`: sticky header row with the back button; use router history for the back target with `/settings` fallback.
- `AppUpdateSettings.tsx` + `electron/updater.cjs`: expose `lastChecked` and the resolved feed URL in the status payload, and add an `update:download-install` handler that downloads then calls `quitAndInstall`.