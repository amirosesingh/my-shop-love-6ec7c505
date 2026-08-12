# Fix the Android crash after terminal registration

## What happens now

On the phone, activation succeeds, but the very next screen (the staff sign-in
list) throws `Cannot read properties of undefined (reading 'length')` and the
app falls back to the root "This page didn't load" screen.

## Diagnosis (most likely, confirmed in step 1)

The sign-in screen loads the people at this branch through a server-side call
(`listTerminalStaff` -> `listTerminalStaffAccounts`). The Android build ships
the whole web app inside the APK and has no server of its own, so that call
cannot land the way it does on web and desktop. The client assumes the answer
always carries a `staff` array:

- `src/lib/staff-admin.ts:122-125` — `res.ok ? res.staff : []`, no guard for a
  malformed payload
- `src/components/auth/CashierPinLogin.tsx:186` — `staff.length` then throws

The crash cannot be reproduced from here, so step 1 confirms it on the device
first; the hardening in steps 2-4 is correct either way.

## Plan

1. **Confirm the failing call.** Include the component/stack detail on the root
   error screen and in the error report, so the phone names the screen and call
   that failed. Then check what the phone actually receives from the staff-list
   call right after activation.

2. **Never crash on a missing list.** Coerce arrays returned by server calls in
   the sign-in path to real arrays, and let the sign-in screen fall back to the
   "type your username" path when the staff list is empty or unavailable — the
   keypad already works from a typed username, so sign-in stays possible.

3. **Give the phone a real server to call.** Server functions need an origin on
   Android. Bake the hosted POS address into the APK at build time and point
   server-function calls at it when running natively; with no address
   configured, show the username entry plus a short setup note instead of a
   blank error page. Document the setting in `docs/android-apk.md`.

4. **Sweep the neighbouring native paths** that read `.length` immediately
   after activation (AppShell inbound-transfer count, branch resolution) and
   guard them the same way, so one missing list never blanks the whole app.

5. **Verify.** Run tests and typecheck, then walk activation -> sign-in list ->
   keypad in a browser with native flags forced, confirming no error boundary
   appears when the staff list is unavailable.

## Technical notes

- No database or schema changes; activation logic itself is unchanged.
- Files touched: `src/lib/staff-admin.ts`,
  `src/components/auth/CashierPinLogin.tsx`, `src/routes/__root.tsx`,
  `src/components/pos/AppShell.tsx`, a small native server-origin helper,
  `scripts/mobile-build.cjs`, `docs/android-apk.md`.
- Version bump for the Android build once the fix is in.