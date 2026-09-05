# Fresh install: connection details, then terminal activation, then sign-in

## What is already in place

Verified by reading the start-up code:

- On a till or phone the launch order is already connection screen → activate terminal → sign-in,
  and the app now waits for one real connection check before choosing, so a working device is no
  longer bounced back to setup.
- With nothing saved, the verdict is "not configured", which sends the device to the connection
  screen — sign-in cannot appear.
- Once details are saved and answer correctly, an unregistered device goes to the existing
  Activate Terminal screen, and only after that to the normal staff sign-in.
- Later launches with valid details and a valid registration go straight to sign-in.
- Local staff sign-in, the keypad, backend and database design stay untouched.

So the requested order exists. Two gaps remain against the request.

## What will change

1. **Emergency Access hidden on a brand-new device.** The first setup screen currently offers an
   "Emergency access" button. On a device that has nothing saved at all, that button will not be
   shown. As soon as details have been saved once (including when they later stop working), the
   button appears exactly as today. Emergency Access itself — how it opens, its code, its screen
   and every other place it appears — is not modified in any way.

2. **Nothing else about the flow changes.** Saving keeps its existing "Test and continue" button;
   the operator presses it as today and the device then moves to terminal activation.

## Deliberately not touched

- Emergency Access behaviour, its screen, its code rules, and its link elsewhere in the app.
- Terminal activation rules and records; no activation step is skipped or duplicated.
- Backend, database, sync, roles, navigation, the cashier keypad and staff sign-in.
- The web version's configuration source and sign-in.

## Technical notes

- `ConnectDatabaseScreen` gains a `showEmergencyAccess` prop (default true). `AppShell` passes
  `false` when the device has never been configured — the same signal already used for the screen's
  wording (`startup.verdict === "unconfigured"` together with `startup.cloudConfigured === false`).
- No change to `startupDecision`, `connection-health.ts`, `registration-status.ts`, activation or
  auth code.
- Add a case to `src/core/activation/__tests__/startup-decision.test.ts` covering the fresh-install
  order, plus a render check that the emergency button is absent when nothing is saved and present
  when details exist. Run `bunx vitest run`, then `node scripts/bump-version.cjs`.
