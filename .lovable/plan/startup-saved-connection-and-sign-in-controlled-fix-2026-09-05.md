# Startup, saved connection and sign-in — controlled fix

## What the inspection found (verified in the current code)

Most of the machinery the brief asks for already exists and will be kept:

- The saved connection is read from the Windows vault / Android secure store and applied
  as the one runtime override (`secure-cloud-config.ts`, `external-supabase-config.ts`).
- There is already a single restore step (`connection-profile.ts`) and a single readiness
  answer (`platform-config-ready.ts`).
- There is already a startup state machine (`startupDecision`) that sends a till to the
  connection screen, then activation, then sign-in, and a branch pin after sign-in.
- The cloud client is lazy and can be rebuilt (`resetExternalClient`), and a saved sign-in
  belonging to a different project is dropped (`dropForeignSession`).
- Sign-in already waits for the restore before contacting the cloud (`pos-auth.tsx`).

Two real defects remain, both confirmed by reading the files:

1. **Windows/desktop start-up has no fixed order.** On Android the fix is in place:
   identity is restored first, then the saved connection wins. On desktop the two
   restores run from different places at the same time — the shell restores the saved
   connection while the terminal check restores the activation record, and the activation
   record carries the cloud address/key that was current when the till was registered.
   Whichever finishes last wins, so a till whose connection was later changed can end up
   signing in against the previous project.

2. **Every sign-in failure is reported as the raw message from the cloud.** The sign-in
   screen shows whatever comes back, so a missing or unreachable connection reads as
   "Invalid login credentials".

## What will change

1. **One start-up order on desktop, matching Android** — restore identity first, then the
   device's saved connection last, so the saved connection is always the authority. This
   is an ordering change inside the existing restore step; no new loader, no second source
   of truth.

2. **Named problem categories for sign-in** — a small mapping module returning
   configuration-required, configuration-invalid, cloud-unreachable, schema-missing,
   terminal-not-activated, branch-missing, invalid-credentials, account-inactive,
   permission-denied, local-backend-unavailable, unknown. Sign-in checks readiness before
   contacting the cloud and returns the matching category instead of a raw message.

3. **Plain wording on the sign-in screen** — the screen shows the reason in the user's
   words and, for a configuration problem, a button that opens the connection screen
   instead of pretending the password was wrong. No keys, tokens or server details are
   ever shown or logged.

4. **Role/profile must load before entry** — sign-in already refuses a deactivated
   account; it will also refuse to report success when the account's role and profile
   cannot be read, with the permission-denied wording.

5. **Tests** — desktop restore order, the readiness gate ahead of sign-in, each error
   category, the existing cashier/PIN tests, the existing recovery/emergency tests and the
   existing configuration-isolation test, all run unchanged.

## Deliberately not touched

- The Electron local backend, the local SQL database and its connection architecture.
- Cashier/staff local sign-in and offline trading.
- Emergency Access in every part: code generation, verification, recovery session, expiry,
  lockout, its screens and its channels — read-only for this work.
- Terminal activation and branch binding rules, the desktop privilege model, the existing
  web deployment configuration, and the role system itself.
- No address or key is added to any build; terminals keep reading theirs at runtime.

## Technical notes

- Order fix inside `hydrateConnectionProfile()` (and the desktop path that triggers it) so
  `hydrateTerminalConfig()` resolves before the vault pair is applied; `NativeBoot.tsx`
  ordering stays as it is.
- New `src/lib/login-failure.ts` with the category union plus a mapper from a Supabase
  auth error and from `hasRequiredPlatformConfig()`/`startupDecision` state.
- `src/lib/pos-auth.tsx`: `login()` consults readiness first and returns
  `{ ok:false, code, error }`; existing callers keep working on `error`.
- `src/platforms/web/components/pos/TerminalLogin.tsx`: render the category wording and
  the "open connection settings" action.
- Version bumped with `node scripts/bump-version.cjs`.
