# Android first run, cashier sign-in and a security check

## What I found (checked in the current code and the live database)

**1. The phone has no way of telling you what is actually wrong.**
The staff list on the sign-in screen is fetched in `listTerminalStaff()`, and
every failure there — no saved backend address, wrong address, refused request,
terminal not registered — is turned into an empty list and thrown away
(`src/lib/staff-admin.ts:165`). The screen then shows one flat line, "No staff
are listed for this terminal's branch yet". So the phone looks broken with no
reason given.

**2. Cashier sign-in on the phone needs the saved backend address, and nothing says so.**
The phone cannot check a PIN by itself: it posts to `/api/public/cashier-login`
on the hosted server. On Android that request only leaves the phone if a
backend address has been saved on the device; otherwise it hits the phone's own
file server and comes back as a page, not an answer. The keypad then reports
"That PIN was not recognised" — the same wording as a genuinely wrong PIN.

**3. The location is never shown.**
The sign-in screen reads the branch to filter the staff list, but never
displays it. There is no branch name, no branch chooser and no "this till is
not bound to a branch yet" state anywhere on that screen.

**4. First open is noisy.**
Anything that escapes anywhere in the app is popped up as a red toast by
`ErrorNotifier`. On a phone that has just been installed almost everything
fails at once (no address, no registration, no roster), so you get a pile of
toasts on top of the setup screen.

**5. Security rules — the database is tighter than it looks.**
- `cashiers`, `pin_attempts` and `terminal_recovery_secrets` have protection on
  with no rules at all, which means no app user can read them — only the
  server. That is correct for PIN material; I will leave it and record why.
- Six routines are callable by a signed-out visitor: coupon claim, welcome
  claim, voucher lookup, and the three terminal-activation ones. Those are the
  public claim/activation flows and have to stay reachable; each already checks
  its own token. I will review the three activation ones for rate limiting.
- 71 routines are callable by any signed-in account. Most are ordinary POS
  work, but this list has never been reviewed. I will go through it and revoke
  the ones only an owner/administrator should ever run (staff account changes,
  PIN setting, security reporting, schema tools).

## What I will change

1. **Say what is wrong, on the phone, in plain words.**
   The roster loader stops swallowing failures and reports a reason: no backend
   address saved, address unreachable, this till is not registered yet, or
   simply no staff at this branch. The sign-in screen shows that reason with a
   single button that opens the right setup screen.

2. **Cashier sign-in gives the real reason.**
   Before checking a PIN, the phone confirms it has somewhere to check it
   against. "No PIN check is possible until this till is connected" instead of
   "PIN not recognised". A genuinely wrong PIN keeps its current wording and
   its lockout behaviour exactly as they are.

3. **Show the location.**
   The sign-in screen displays the branch this till belongs to. When there is
   none, it says so and points at activation instead of silently showing an
   empty staff list.

4. **Calm first run.**
   While the phone is still unconfigured, the catch-all red toasts are held
   back — the setup screen already explains the situation. Toasts resume the
   moment the device is configured. Nothing is hidden once the till is live.

5. **Remove what is not used.**
   A sweep for unreferenced files, dead exports and unused imports across the
   app, deleting only what nothing else reaches. No behaviour change.

6. **Security pass.**
   Revoke run-permission on the routines that ordinary staff should not be able
   to call, keep the public claim/activation ones public, and leave the three
   locked tables locked. Delivered as one migration you approve before it runs.

## Not touched

Emergency Access in every part; the Windows local database and local backend;
terminal activation and branch binding rules; supervisor/admin online sign-in;
the PIN lockout rules; the cloud connection architecture.

## Technical notes

- `listTerminalStaff()` returns `{ staff, reason }`; `CashierPinLogin.tsx`
  renders the reason plus the branch name from `boundBranchName()`.
- `cashierLogin()` in `pos-auth.tsx` returns a `login-failure` category, reusing
  the existing `src/lib/login-failure.ts` map rather than a second one.
- `ErrorNotifier` consults `hasRequiredPlatformConfig()` before announcing.
- Dead-code sweep with `knip`-style analysis run manually; deletions listed in
  the final report.
- One migration with `REVOKE EXECUTE ... FROM authenticated` per reviewed
  routine; no table, column or policy dropped.
- Tests for each new reason string and the branch display; full suite,
  typecheck, then `node scripts/bump-version.cjs`.
