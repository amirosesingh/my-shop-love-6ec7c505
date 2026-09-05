# Why the desktop till closes itself when the database isn't configured

## What actually happens (traced in the code, not guessed)

There is a one-minute start-up timer in the desktop shell. It exists to catch a
broken build: if the till never reports "I am on screen and working", the timer
fires and puts the app into repair mode.

`electron/main.cjs:2009`
```js
readyWatchdog = setTimeout(() => enterSafeMode("Startup timed out"), 60_000);
```

That report only happens from inside the main till screen
(`src/platforms/web/components/pos/AppShell.tsx:223` → `reportAppReady()`).
When the device has no database details, the page can settle on the failure /
setup screen in `src/routes/__root.tsx` instead — the till screen never mounts,
so nothing ever cancels the timer. Exactly one minute later the timer fires.

Then the repair path itself kills the app:

`electron/main.cjs:157-166`
```js
function enterSafeMode(reason) {
  ...
  for (const win of BrowserWindow.getAllWindows()) win.destroy();  // last window closes
  mainWindow = null; displayWindow = null;
  recovery.open();
}
```
Closing the last window fires the shutdown handler, which ends with:

`electron/main.cjs:2019-2029`
```js
app.on("window-all-closed", async () => { ... if (process.platform !== "darwin") app.quit(); });
```

It closes every window, then asks for the repair window — but the shutdown
handler is already running and finishes by quitting the whole app. The repair
window is torn down with everything else. From the shop's point of view: the
till sits on the setup screen for about a minute and then simply disappears.

This is not specific to "database not configured" — any state that keeps the
main screen from mounting (a slow first launch, a failed page load, a crashed
local server) ends the same way.

## The fix

1. **Never quit while the app is deliberately in repair mode.** The shutdown
   handler will stop and clean up as it does today, but skip the final quit when
   safe mode is on or the repair window is open. Open the repair window first,
   then close the till windows, so there is never a moment with no window.
2. **Don't treat "waiting for setup" as a broken build.** The setup /
   connection screen and the failure screen will report that the app is alive,
   so the one-minute timer is cancelled. The timer keeps doing its real job:
   catching a build that renders nothing at all.
3. **Give the timer an honest signal.** The shell will also cancel it as soon as
   the page finishes loading and paints (`did-finish-load` on the main window),
   so a first launch that is merely slow, or that lands on the setup screen,
   cannot be mistaken for a dead build.
4. **When the local app server dies, recover instead of drifting.** Today its
   exit is only written to the log (`electron/main.cjs:259-263`) and the window
   is left pointing at a dead address. It will go to repair mode instead — which,
   after fix 1, keeps the app open with Emergency Access reachable.

Emergency Access, terminal registration, sealed credentials, trading screens
and the cashier login are untouched.

## Technical notes

- `electron/main.cjs`: guard `window-all-closed` with `if (safeMode || recovery.isOpen()) return;`
  before `app.quit()`; reorder `enterSafeMode` to `recovery.open()` before destroying
  windows; clear `readyWatchdog` on the main window's `did-finish-load`; call
  `enterSafeMode` from the `serverProcess.on("exit")` handler when not already quitting.
- Renderer: call `reportAppReady()` from the root error/setup boundary and from
  `ConnectDatabaseScreen`, so any screen that a person can actually see counts as ready.
- Tests: a new `electron`-side unit test asserting that entering safe mode leaves a window
  open and does not quit, plus a renderer test that the connect-database screen reports ready.
- Verify with `bunx vitest run` and `bunx tsgo --noEmit -p tsconfig.json`, then
  `node scripts/bump-version.cjs`.
