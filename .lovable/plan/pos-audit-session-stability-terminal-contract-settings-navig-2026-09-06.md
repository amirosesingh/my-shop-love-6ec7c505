# POS audit: session stability, terminal contract, settings navigation

This is an in-place audit and repair. No new authentication, terminal, permission, branch, settings or navigation system is introduced; every change lands inside the modules that already own the behaviour.

## Baseline audit — what the reads confirmed

Verified this turn by reading the code and querying the live database.

**Already correct, and staying as-is**

- `activeBranchId()` in `src/lib/active-branch.ts` is already the single terminal-first branch resolver (terminal config → bound branch → in-view → local mirror → sole branch). Nothing else will resolve branches.
- `src/lib/session-expiry.ts` already distinguishes a rejected token (401, or 403 that names a token problem) from connectivity trouble (5xx, offline). Timeouts already never sign anyone out.
- Terminal, user, cashier and shift sessions are already separate records (`terminal_tokens`, `user_sessions`, `pos-credentials` secrets, shift sessions). They will not be merged.
- `settings.sessions.tsx`, `TerminalTokens.tsx`, `SettingsNavTree.tsx` (categories, search, persisted open state, keyboard walking, mobile drawer) already exist and will be extended, not replaced.
- The live database already carries the current activation contract for claim (5 arguments, atomic, revoked/expired/branch checks) and status (5 columns including `is_claimed` and `expires_at`), with the pre-login grants in place. The client already calls that contract.

**Confirmed problems**

1. **Duplicate heartbeat routine in the live database.** Both `terminal_token_heartbeat(uuid, boolean)` and `terminal_token_heartbeat(uuid, boolean, text, boolean)` exist, and the extra arguments are optional. A call naming only the first two arguments — which is exactly what runs right after a successful activation and in the fallback path — is ambiguous and fails. This is the migration drift named in the request.
2. **`supabase/schema.sql` is stale.** It still describes the two-argument claim and a three-column status, so it no longer reflects the deployed contract and misleads any future repair.
3. **Sign-out is not race-safe.** `logout()` in `src/lib/pos-auth.tsx` awaits the session-end call and the cloud sign-out, then unconditionally clears session state and every stored credential. A sign-in that completes during those awaits is wiped by the older sign-out finishing afterwards — the reported "log in, get logged out again" symptom. The expired-session listener and the account-deactivated poll both call the same `logout()`, so a single stale rejection can also end a session that was created after the failing request was sent.
4. **Auto-lock is wired to full sign-out.** `lock` is literally `logout`, so an idle lock also drops the device credentials it does not need to drop; nothing distinguishes locked from logged out.
5. **Nested scrolling in Settings.** `AppShell` already owns one scroll region (`h-dvh` + a single `overflow-y-auto` main); the settings rail adds its own bounded scroller. One stray full-height container at `AppShell.tsx:310` uses `min-h-screen` inside that shell.
6. **No collapsed rail in Settings.** The sidebar has a persisted per-category open state but no collapsed-rail mode like the main `SidebarNav`.
7. **Health report has no activation-contract check**, so a broken activation routine surfaces as "Unable to assign branch" rather than a plain cause.

## What will be done

**A. Session lifecycle (root cause of the repeated logout)**

Inside the existing `AuthProvider`, add a monotonic session epoch. Every sign-in bumps it; `logout()` captures it on entry and, after its awaits, only clears state when the epoch is unchanged. Repeated sign-outs become harmless, and an old sign-out can never clear a new session. The expired-session listener and the deactivation poll carry the epoch of the request that failed. Lock becomes a distinct path that clears the person, not the device's terminal registration or its activation. States stay named and separate: active, locked, logged out, expired, revoked, offline.

**B. Terminal activation contract**

One corrective migration that drops the stale two-argument heartbeat, keeps and re-grants the current four-argument one, and re-asserts the current claim and status definitions with their pre-login grants. Then `supabase/schema.sql` is updated so the canonical file matches the deployed contract. No function is dropped without its replacement being present in the same migration.

**C. Health checks**

Extend `src/lib/db-health.ts` with activation-contract checks (status, claim, heartbeat reachable and unambiguous) and a branch-readiness check, so an administrator reads "Terminal activation routine is out of date" instead of a branch error. No credentials or SQL are exposed.

**D. Activation success state**

Reuse the existing activation component to show terminal name, terminal ID, branch and active status before continuing. The server-side atomic claim is unchanged.

**E. Terminal admin screen**

Extend the existing `TerminalTokens` panel to show terminal ID, device name, platform, branch, status, registered at, last heartbeat, app version and last/current user from columns that already exist. Administrative actions stay behind the existing admin permission checks and server authorisation; nothing lets a terminal change its own branch, role or permissions.

**F. Settings navigation and scrolling**

Add a collapsed rail to the existing `SettingsNavTree` persisted under `pos.settings.nav.collapsed`, with tooltips when collapsed. Category folding, search, keyboard walking and the mobile drawer all stay. Replace only the one `min-h-screen` container inside `AppShell` that creates a second viewport; every other scroller is left alone.

**G. Tests**

Extend the existing suites: repeated sign-out is harmless, sign-out followed immediately by sign-in stays signed in, a stale sign-out cannot clear a new session, a token refresh does not sign anyone out, a terminal stays registered after a user signs out, the activation contract has exactly one heartbeat routine with the right grants, branch resolution stays terminal-first, and the collapsed rail persists.

## Explicitly no change required

- `src/lib/active-branch.ts` — already the sole resolver; the branch problem is upstream data, not this file.
- `src/lib/session-expiry.ts` classification rules — already correct.
- `src/lib/terminal-session.ts`, machine-account provisioning — already correct and separate from user sessions.
- Permission model in `src/lib/permissions.ts` and the server-side checks — terminals will not be given user permissions; nothing is copied across.
- The login and startup screens' appearance and flow.
- The QR generation, scanning and encrypted payload path.
- Product deletion protection, offline queue, shift model, reports and inventory.

## Technical notes

- One new migration: drop the ambiguous `terminal_token_heartbeat(uuid, boolean)` overload, recreate/re-grant the current heartbeat, claim and status functions.
- `supabase/schema.sql` updated in place to match.
- Code touched: `src/lib/pos-auth.tsx` (epoch-guarded lifecycle), `src/platforms/web/components/pos/AppShell.tsx` (lock vs logout wiring, one container), `src/lib/db-health.ts`, `src/platforms/web/components/pos/TerminalTokens.tsx`, `src/platforms/web/components/pos/settings/SettingsNavTree.tsx` and `SettingsShell.tsx`, plus the activation success state in the existing activation component.
- Checks to run at the end: typecheck, `npm test`, `npm run logic:scan`, `npm run build`, and a version bump through `scripts/bump-version.cjs`.
- A final structured report will cover retained functionality, bugs fixed, no-change areas, database, security, UI, test results and regression coverage across Windows POS, mobile POS, tablet/web admin, cashier PIN, admin login, activation, branch isolation, shifts, offline and settings.
