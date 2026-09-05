# Supervisor/Admin sign-in on the till and the Android app

## What the reading confirms

There is **one** supervisor/admin sign-in path, shared by all three platforms
(`login()` in `src/lib/pos-auth.tsx`): it maps what was typed to an address and
calls `signInWithPassword` on the cloud client. Cashier/staff PIN sign-in is a
separate path (`cashierLogin()` → local server endpoint → cached verifier) and
is untouched by everything below.

Two facts explain why the browser can succeed while the till fails with the
same username and password:

1. **The two platforms can be pointed at different central databases.**
   `supabaseConfig()` (`src/lib/external-supabase-config.ts`) resolves the
   website's address and key from the hosting environment, but on a till or
   phone it uses *only* the per-device values saved in Settings → Database &
   Cloud Connection. An account that exists in the website's project does not
   exist in a different project, and the cloud replies with exactly
   "Invalid login credentials".

2. **Every failure is shown as the cloud's raw sentence.** `login()` returns
   `error.message` verbatim, so a wrong address, a stale saved key, a blocked
   network or an unreachable service all read as "Invalid login credentials".
   This is why the real cause is currently invisible.

Which of the two is happening on your machine is **not yet proven** — no code
read can tell me what a particular till has saved in its vault. Step 1 makes
the till say it out loud; step 2 fixes what it reports.

## Step 1 — Make the till tell the truth about a refusal

- Classify the outcome of a supervisor/admin sign-in into distinct internal
  results instead of one string: `INVALID_CREDENTIALS`,
  `AUTH_SERVICE_UNAVAILABLE`, `CONFIG_MISSING`, `CONFIG_REJECTED` (bad key /
  bad project address), `STAFF_DISABLED`, `SESSION_CREATION_FAILED`.
- Show a plain sentence per case on the sign-in screen, and, on a till only,
  a small line naming which central database this device is signed in
  against (host only — never the key). That single line is usually enough to
  confirm or rule out cause 1 immediately.
- When the cloud cannot be reached at all, the message becomes
  "Supervisor/Admin sign-in needs an online connection" — no offline
  supervisor login is invented, because none exists today.
- Record the classified reason in the existing diagnostics log.

## Step 2 — Fix the cause the classification names

- **Wrong or stale saved connection** (expected outcome): the Database & Cloud
  Connection screen gains a "Test sign-in reachability" result that reports
  the project it is talking to and whether the saved key is accepted, so the
  operator can correct the address/key once and the till then authenticates
  against the same database as the website. No hardcoded fallback address is
  added — the device store stays the only source on a till.
- **Configuration read after the client was built**: ensure the sign-in screen
  waits for the saved connection profile to be restored before it will submit,
  so a first-launch sign-in can never run against a half-restored profile.
- **Anything else the classification reveals** (for example the account being
  inactive, or the staff/role lookup failing after a successful sign-in) is
  fixed at that exact point, keeping authentication and authorisation
  separate: a successful sign-in is never rejected merely because role data
  has not loaded yet.

## What does not change

- Cashier and staff PIN sign-in, local backend, local database and offline
  trading: untouched.
- Emergency Access — code generation, verification, recovery sessions,
  expiry, lockout, privileges: **not modified at all**.
- Terminal identity, branch, company, backend address and cloud configuration
  are never reset or rewritten because someone signs in.
- The central database stays authoritative for roles and permissions; the
  screen can never grant itself supervisor rights, and no service key or
  password is added to the desktop or Android build.

## Technical notes

- `src/lib/pos-auth.tsx`: `login()` returns `{ ok, code, error }`; error text is
  derived from `code`, not passed through from the cloud.
- New small helper for classifying a sign-in failure, with unit tests covering
  each code (invalid password, unreachable service, missing/refused
  configuration, deactivated account).
- `src/platforms/web/components/pos/TerminalLogin.tsx`: renders the message for
  the code and, on terminals, the connected-host line; blocks submit until
  `awaitProfileHydrated()` resolves.
- `src/platforms/web/components/pos/DatabaseConnectionSettings.tsx`: adds the
  auth-reachability result to the existing connection test.
- Checks after the change: typecheck, the full existing test suite, the new
  auth tests, the desktop and Android build scripts, and the existing
  configuration-leak tests (`src/lib/__tests__/own-database.security.test.ts`).
- Version bumped with `node scripts/bump-version.cjs`.

## One thing I need from you

If you can, open Settings → Database & Cloud Connection on the failing till and
tell me the address shown there, and the address the website uses. If they
differ, that is the whole bug and step 2 is a one-line correction on the
device rather than a code change.
