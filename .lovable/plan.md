# Android: clean first run, working sign-in (both kinds), security check

## What I found (verified in the current code and the live database)

**1. Nothing on the phone tells you why sign-in fails.**
Both sign-in paths fail with the same misleading wording:

- *Cashier PIN*: the phone cannot check a PIN by itself. It posts to
  `/api/public/cashier-login` on the hosted server, which only leaves the phone
  when a backend address has been saved on the device. Without it the request
  is answered by the phone's own file server, and the keypad reports "That PIN
  was not recognised" — identical to a genuinely wrong PIN.
- *Supervisor / Admin*: the email+password check runs against the cloud project
  saved on the device. When that address/key pair is missing, wrong, or belongs
  to a different project than the one holding your accounts, the cloud replies
  "Invalid login credentials" and that raw sentence is what you see. Your
  accounts are fine; the phone is asking the wrong place, or no place at all.

**2. The staff list silently disappears.**
`listTerminalStaff()` turns every failure — no address, unreachable, till not
registered, refused — into an empty list (`src/lib/staff-admin.ts:165`). The
screen then shows one flat line about "no staff at this branch".

**3. The location is never shown.**
The sign-in screen reads the branch only to filter that list. It never displays
the branch name and never says "this till is not bound to a branch yet".

**4. First open is noisy.**
Anything that escapes anywhere is popped up as a red toast by `ErrorNotifier`.
On a freshly installed phone nearly everything fails at once, so you get a pile
of pop-ups on top of the setup screen.

**5. Security rules — the database is tighter than it looks.**
- `cashiers`, `pin_attempts` and `terminal_recovery_secrets` are protected with
  no rules at all, so no app user can read them — only the server. Correct for
  PIN material; I will leave it and record why.
- Six routines are callable by a signed-out visitor: coupon claim, welcome
  claim, voucher lookup and the three terminal-activation ones. Those are the
  public claim/activation flows and must stay reachable; each checks its own
  token. I will confirm the activation three are rate-limited.
- 71 routines are callable by any signed-in account and have never been
  reviewed. I will go through them and revoke the ones only an owner or
  administrator should run — staff account changes, PIN setting, security
  reporting, schema tools.

## What I will change

1. **One honest answer on the sign-in screen, for both kinds of sign-in.**
   Before contacting anything, the phone checks what it actually has and names
   the problem: no connection saved, connection saved but unreachable, this
   phone is not registered as a till yet, no branch assigned, or the account
   genuinely was refused. Only the last one is presented as a wrong
   password/PIN. Each configuration problem shows one button that opens the
   screen that fixes it.

2. **Show the location.** The branch this till belongs to appears on the
   sign-in screen. When there is none, it says so and points at activation
   instead of showing an empty staff list.

3. **Staff list stops swallowing failures.** It reports its reason so the
   screen can show it, and still falls back to the roster stored on the phone
   when the connection is down.

4. **Calm first run.** While the phone is unconfigured, the catch-all red
   pop-ups are held back — the setup screen already explains the situation.
   They resume as soon as the device is set up; nothing is hidden on a live
   till.

5. **Simpler first-run path.** One ordered screen sequence with no dead ends:
   connection → test → register this till → branch → sign in. Each step shows
   only what it needs and says what is still missing.

6. **Remove what is not used.** A sweep for unreferenced files, dead exports
   and unused imports, deleting only what nothing reaches. No behaviour change.

7. **Security pass.** One migration you approve first: revoke run-permission on
   the routines ordinary staff should not call, keep the public claim and
   activation ones public, leave the three locked tables locked.

## Not touched

Emergency Access in every part; the Windows local database and local backend;
cashier offline operation; terminal activation and branch binding rules; the
PIN lockout rules; the cloud connection architecture; the role system.

## Technical notes

- `listTerminalStaff()` returns `{ staff, reason }`; `CashierPinLogin.tsx`
  renders the reason plus `boundBranchName()`.
- `cashierLogin()` in `pos-auth.tsx` returns a category from the existing
  `src/lib/login-failure.ts` map, the same one `login()` already uses — no
  second error vocabulary.
- Admin path: `login()` already gates on `hasRequiredPlatformConfig()`; add a
  project-identity check so a saved connection pointing at a different project
  reports `configuration-invalid` instead of `invalid-credentials`.
- `ErrorNotifier` consults `hasRequiredPlatformConfig()` before announcing.
- Dead-code sweep listed file by file in the final report.
- Migration: `REVOKE EXECUTE ... FROM authenticated` per reviewed routine; no
  table, column or policy dropped.
- Tests per reason string, the branch display and the admin project-mismatch
  case; full suite, typecheck, then `node scripts/bump-version.cjs`.
