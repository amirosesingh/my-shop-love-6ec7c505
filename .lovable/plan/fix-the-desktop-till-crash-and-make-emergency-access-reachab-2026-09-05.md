# Fix the desktop till crash and make Emergency Access reachable

## What is actually wrong

The desktop app crashes on every launch with
"Cannot assign to read only property 'write'". This is not about the database
details being missing — it happens before any of that matters.

Confirmed by reading the code: on start-up, the admin-unlock helper
(`src/platforms/windows/components/PrivilegeGate.tsx`) walks through the desktop
bridge and replaces each of its functions with a wrapped version, so a refused
action can ask for an administrator PIN. The desktop shell hands those functions
to the page as a **read-only** set, so the very first replacement (`write`)
throws and the whole screen dies. The web and phone builds never hit this
because they have no desktop bridge.

The second symptom follows from the first: the failure screen's "Emergency
access" button moves within the app instead of loading the repair screen fresh,
so the same start-up code runs again, crashes again, and the repair screen never
appears.

## The fix

1. Stop replacing the desktop shell's functions. Instead, put a transparent
   stand-in in front of the bridge that forwards every call and adds the
   administrator prompt only when a call is refused. Same behaviour, nothing
   written back into the read-only set. If even the stand-in cannot be installed,
   the app continues without the prompt rather than dying.
2. Make the whole unlock helper fail-safe: if anything in it goes wrong, the till
   still loads.
3. Make "Emergency access" on the failure screen do a full reload straight to the
   repair screen on the desktop and phone builds, so it can never be blocked by
   whatever broke the app.
4. Keep the repair screen itself outside the start-up helpers it exists to repair
   (verify, and correct if needed).
5. Cover both with tests: a bridge whose functions cannot be replaced must not
   crash the app and must still prompt for an administrator on a refused action.

## Technical notes

- `PrivilegeGate`: replace the `for (const [key, fn] of Object.entries(bridge))`
  assignment loop with `win[name] = new Proxy(bridge, { get })` returning wrapped
  functions (window properties are writable; contextBridge exposures are not).
  Restore `win[name] = bridge` on cleanup. Wrap the whole effect body in
  `try/catch`.
- `src/routes/__root.tsx` error boundary: on `isTerminalApp()`, render a button
  calling `window.location.assign(RECOVERY_PATH)` instead of the router `Link`;
  keep the existing `EmergencyAccessLink` for in-app screens.
- New test `src/platforms/windows/__tests__/privilege-gate.test.tsx` with a frozen
  bridge; run `bunx vitest run` and `bunx tsgo --noEmit -p tsconfig.json`, then
  `node scripts/bump-version.cjs`.
- Untouched: IPC privilege rules, admin sessions, recovery codes, connection
  settings, cashier login UI.
