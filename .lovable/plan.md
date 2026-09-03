# Fresh-install Emergency Access — make it truly independent

## What the audit found

The emergency code itself is already correct and local: `src/lib/emergency-pin.ts` (per-device secret from Windows OS vault / Android Keystore) and `src/lib/emergency-fallback-pin.ts` (clock-only code) derive a 6-digit code per minute with ±3 minutes tolerance, verified with WebCrypto/Node crypto, no network, no database, no stored code. The connection gates on Android already step aside for `/recovery` (`OfflineGate`, `NativeBoot`, guarded by `src/lib/__tests__/recovery-gate.test.ts`).

Four real defects block a genuinely fresh install:

1. **The first-run branding form swallows the recovery screen.** In `src/routes/__root.tsx`, `FirstRunSetup` wraps `<Outlet />`, and on a desktop install where branding has never been written it renders its own full-screen form instead of the route. On a fresh Windows install, `/recovery` therefore never renders — the operator is asked for a shop name before they can reach connection repair.
2. **The activation screen is a dead end.** `TerminalActivation` (shown full-screen from the root error boundary and from `AppShell` when the till is unregistered) has no Emergency Access link at all. The only entry points today are the Android offline gate and the Electron "Terminal not configured" dialog; an unregistered till that lands on the activation screen has no way out.
3. **Emergency entry shares the cashier keypad lockout.** `EmergencyPinGate` calls `lockoutRemaining` / `notePinFailure` / `clearPinFailures` from `src/lib/pin-lockout.ts`, which uses the single localStorage key `pos.pin.lockout`. A cashier who mistyped their PIN five times locks Emergency Access too, and a wrong recovery code locks the till keypad. Recovery must have its own counter.
4. **Stale gate state on reopen.** `EmergencyPinGate` keeps `pin`, `error` and `busy` across mount/unmount transitions of the recovery screen and does not cancel an in-flight verification, so closing and reopening can show a stale error or a stuck disabled keypad.

Not defects (leaving alone): the code algorithm, the drift window, the escrow/company-salt path, Android gate exemptions, and everything about normal cashier/manager login.

## The fix

1. **Exempt recovery from the first-run form.** `FirstRunSetup` checks the current path with the existing `isRecoveryPath` helper and renders its children immediately on `/recovery`, on every platform. Branding setup still appears everywhere else.
2. **Add an Emergency Access escape everywhere a fresh terminal can get stuck.** A single small `EmergencyAccessLink` component (router `<Link to="/recovery">`, never an `<a href>`) rendered on the `TerminalActivation` full screen and in the root error boundary's activation branch. The existing links in `OfflineGate` and `CloudSetupGate` switch to the same component so there is one implementation.
3. **Give recovery its own guessing brake.** `pin-lockout.ts` gains an optional scope so the emergency gate uses key `pos.pin.lockout.recovery`, fully separate from the cashier keypad. Same limits (5 attempts, 5-minute lock), same behaviour otherwise.
4. **Reset the gate cleanly.** `EmergencyPinGate` clears `pin`/`error`/`busy` on mount, ignores the result of a verification whose component has unmounted, and never leaves the keypad disabled after a failed check.
5. **Verify the render path is dependency-free.** Confirm the providers between the gates and `<Outlet />` (`AuthProvider`, `PermissionsProvider`, `PosProvider`) render children without waiting on a session or a network call when nothing is configured; if any of them blanks on a fresh install, exempt `/recovery` the same way rather than weakening them.

No change to the code algorithm, drift window, escrow, normal login, registration, permissions, or sync.

## Tests

Extend `src/lib/__tests__/recovery-gate.test.ts` and add unit tests covering:
- `/recovery` renders through the first-run form when branding is unconfigured;
- the activation screen exposes an Emergency Access link, and no entry point uses a raw `<a href="/recovery">`;
- a cashier keypad lockout does not lock Emergency Access, and vice versa;
- correct code accepted, wrong code rejected, code from outside the drift window rejected (already covered — kept green).

## Technical notes

- Files touched: `src/routes/__root.tsx`, `src/platforms/web/components/pos/FirstRunSetup.tsx`, `src/platforms/web/components/pos/TerminalActivation.tsx`, `src/platforms/web/components/pos/EmergencyPinGate.tsx`, `src/platforms/mobile/components/OfflineGate.tsx`, `src/platforms/web/components/pos/CloudSetupGate.tsx`, `src/lib/pin-lockout.ts`, plus one new small link component and test updates.
- No schema, backend, Electron main-process or Android native changes.
- Version bumped with `node scripts/bump-version.cjs`.
- Final message will carry the consolidated audit report: root cause, files changed, fresh-install behaviour, code algorithm, Android/Electron behaviour, security notes, tests.
