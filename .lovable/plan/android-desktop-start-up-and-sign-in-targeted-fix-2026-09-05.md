# Android & Desktop start-up and sign-in — targeted fix

## What the inspection found

The required order already exists and will be kept, not rebuilt:

- Saved connection details are read from the Windows vault / Android secure store and applied
  as the single runtime override (`secure-cloud-config.ts`, `external-supabase-config.ts`).
- One restore step (`connection-profile.ts`) restores identity first, then the device's saved
  connection, so the device's own saved connection wins.
- One readiness answer (`platform-config-ready.ts`) reports missing / incomplete / invalid.
- One decision function (`startupDecision`) already orders: connection screen → terminal
  registration → sign-in, and the app shell renders exactly that order.
- Sign-in already waits for the restore, checks readiness, probes the company database and
  reports named reasons instead of "invalid credentials" (`login-failure.ts`, `pos-auth.tsx`).
- The web build keeps taking its connection from the hosting environment; nothing here touches it.

Three real defects, each confirmed by reading the code:

1. **The launch decision is taken before the connection has ever been checked.**
   The shell asks for a verdict on the company database, but nothing runs that check during
   start-up — the value starts at "unreachable". On a phone, which is not allowed to trade
   offline, a fully configured and registered terminal is therefore sent to the connection
   screen at every launch, and sign-in is never reached.

2. **The connection check can run before the saved connection has been applied.**
   The check waits for the terminal's activation record but not for the device's saved
   connection, so a first probe can test nothing, or the previous project, and come back
   "not configured" / "refused".

3. **One second is not enough on a phone.** The check gives the company database one second;
   a normal mobile connection often takes longer, and a slow answer is currently recorded as
   "cannot be reached", which again bounces the device to the connection screen.

## What will change

1. **A real initialisation step before any decision.** Start-up will: restore saved settings →
   validate them → build the database client → *await one connection check* → only then decide
   between connection screen, terminal registration and sign-in. While that runs the device
   shows the existing loading screen, never a premature connection or sign-in screen.

2. **The connection check waits for the saved connection**, so it always tests the values the
   device actually holds, and the client is rebuilt whenever those values change.

3. **A realistic timeout for the first check** (longer on the first attempt, phone-friendly),
   with a slow answer retried once before it is called unreachable.

4. **Terminal registration stays where it is** — after a proven connection, before sign-in —
   reusing the existing screen, fields and records. A revoked or deleted terminal keeps its
   existing re-registration path; no duplicate registrations are created.

5. **Clear wording** for each distinct problem (not configured, details incomplete, details
   invalid, cannot be reached, refused key, wrong company database, terminal not registered,
   terminal revoked, wrong password, account inactive, no permission), reusing the existing
   category list. No keys, tokens or addresses are shown or logged.

## Deliberately not touched

- The web application's configuration source and sign-in flow.
- Secure storage on either device type; nothing is downgraded, hardcoded or defaulted, and
  there is no fall back to web values.
- The cashier keypad screen's appearance, the POS screens, roles, permissions and navigation.
- Terminal registration rules, the local database, offline trading and Emergency Access.

## Technical notes

- `probeCloudVerdict()` in `src/core/activation/connection-health.ts`: await
  `hydrateConnectionProfile()` (not just `hydrateTerminalConfig()`); raise `CLOUD_TIMEOUT` for
  the first probe and retry once before returning `unreachable`.
- `useStartupGate()` in `src/core/activation/registration-status.ts`: run `checkHealth(true)`
  once on mount after the profile restore, expose `probing` so `AppShell` holds the loader
  until the first verdict has settled; keep the existing `subscribeConnectivity` refresh.
- `AppShell` gate: extend the current `terminal.hydrating || !profileHydrated` loader condition
  with the new `probing` flag; branch order (`connect-database` → `activate` → login) unchanged.
- Tests: extend `startup-decision.test.ts`, `platform-config-ready.test.ts`,
  `connection-health.test.ts` and `android-first-run.test.ts` with the four scenarios
  (fresh install, config-without-terminal, config-and-terminal, invalid terminal); existing
  suites run unchanged.
- Version bumped with `node scripts/bump-version.cjs`.
