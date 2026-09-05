# Why the setup steps don't appear in the preview — and how to see them

## What is actually happening

The three-step start-up (connection details → activate terminal → sign-in) is written and active,
but it deliberately only runs on a real till: the Windows app or the Android app. What you are
looking at right now is the ordinary browser preview, and the browser version is built to take its
connection from the hosting service, never from a setup screen. That is why the browser goes
straight past the setup steps — not because the steps are missing.

Verified in the code: the setup branch is entered only when the app is running inside the desktop
shell or the phone app; a plain browser skips it by design.

## What will change

1. **A preview switch for the setup flow.** A hidden, opt-in switch so the browser preview can be
   made to behave like a fresh till: add `?terminal=1` to the preview address (it is remembered for
   that browser until you turn it off with `?terminal=0`). With it on you see exactly what a new
   device sees — connection details first, then Activate Terminal, then staff sign-in. It changes
   nothing about how the app behaves for real customers on the web, and nothing on tills or phones.

2. **Emergency Access hidden on a brand-new device.** On a device with nothing saved at all, the
   "Emergency access" button is not shown on the first setup screen. Once details have been saved
   once — including when they later stop working — it appears exactly as today. Emergency Access
   itself is not modified in any way.

3. **Saving keeps its existing button.** After entering the details the operator presses
   "Test and continue" as today, and the device then moves on to terminal activation.

## Deliberately not touched

- Emergency Access behaviour, screen and code rules.
- Terminal activation rules and records; no step is skipped or duplicated.
- The web version's real configuration source, backend, database, sync, roles, navigation, the
  cashier keypad and staff sign-in.

## Technical notes

- Add `isSimulatedTerminal()` to `src/platform-config/platform.ts`, backed by a `localStorage` flag
  set from the `?terminal=` query parameter, and fold it into a single `isTerminalShell()` helper
  used by the `AppShell` start-up branch only (not by `isTerminalApp()`, so secure-storage and
  config resolution rules are unchanged).
- `ConnectDatabaseScreen` gains `showEmergencyAccess` (default true); `AppShell` passes `false` when
  the device has never been configured (`verdict === "unconfigured"` and `cloudConfigured === false`).
- Tests: extend `startup-decision.test.ts` with the fresh-install order and add a render check for
  the emergency button's absence/presence. Run `bunx vitest run`, then `node scripts/bump-version.cjs`.
