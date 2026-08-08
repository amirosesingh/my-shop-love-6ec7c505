# Terminal-bound branches, safe settings fallback, live security alerts, instant unlock

Five connected fixes, checked against the current code first.

## 1. Branch follows the terminal, not the person

The terminal binding already exists (`terminalStoreId` from the registered token) and the shell pins the branch to it, but only after sign-in, and the staff record's own store still competes with it.

- Registration stores the branch id and branch name on the terminal record, so the till knows its branch before anyone signs in.
- On sign-in the session is bound to the terminal's branch, whatever the staff record says. The same person on another till trades in that till's branch.
- The branch switcher stays hidden on a bound till for everyone, admins included; unbound browsers keep it.
- The staff record's store is kept for reporting only and no longer selects the trading branch.

## 2. Settings never fail before sign-in

The rules reader throws "Not signed in" when called without a session, which is what surfaces at boot and on the shift screen.

- Null-safe chain: terminal value, then branch, then cluster, then global default, then the built-in default. A missing or unreachable layer is skipped, not raised.
- Reading defaults (including shift rules) without a session returns global defaults instead of throwing; saving still requires a signed-in supervisor.
- Loading and error states are separated so a slow read cannot look like "no settings".

## 3. Security alerts re-test themselves

Findings currently sit in the list until someone marks them fixed.

- Opening the security page or the header bell runs the live posture check first, then shows the result.
- Anything the fresh check no longer reports is closed automatically and disappears; only conditions still true remain.
- Manual acknowledge stays, but a re-raised condition reopens itself.
- A "last checked" time makes it clear the list is live.

## 4. No hardcoded branch names in lock screens

- Lock and notification strings read the active terminal's branch name ("No shift open at <branch>"), falling back to the registered location name, then a neutral "this terminal".
- Applies to the shift lock panel, the supervisor bypass bar, activation screens and shift alerts.

## 5. Opening a shift unlocks instantly

`openShift` already sets local state, but a later refused read can still re-lock, and the shift can be stamped with a branch other than the terminal's.

- Opening a shift stamps the terminal's branch, sets shift state and clears the lock flag in one update; the guard reacts to that state directly.
- A failed or refused refresh never clears a shift known to be open — it only shows "reconnecting".
- No restart or re-login needed after opening.

## Technical notes

- `src/lib/terminal-tokens.ts` + `TerminalActivation.tsx`: persist `locationId`/`locationName` on activation; expose a `useTerminalBranch()` hook.
- `src/lib/pos-auth.tsx`: `terminalStoreId` becomes authoritative; `canSwitchStores` false whenever a binding exists; expose `terminalStoreName`.
- `src/components/pos/AppShell.tsx`: pin `currentStore` from the binding before the first render pass; hide the switcher.
- `src/lib/pos-store.tsx`: `openShift` uses the bound store id; `refreshActiveShift` keeps last-known-good and the just-opened grace window covers slow relays.
- `src/lib/pos-rules.functions.ts` / `pos-rules.ts` / `settings-scope.ts`: unauthenticated read returns defaults instead of `throw new Error("Not signed in")`; resolver walks TERMINAL → BRANCH → CLUSTER → GLOBAL → `fallback`.
- `src/lib/security-alerts.ts`, `SecurityAlertBell.tsx`, `settings.security-alerts.tsx`: run `security_selfcheck` on open, then list; auto-resolve stale fingerprints.
- `src/components/pos/ShiftGuard.tsx`: branch name interpolation from the terminal binding.

### Database / SQL updates

- `supabase/sql/01_stores_and_terminals.sql`: require `location_id` at activation, return branch id + name from `terminal_token_status`, add a branch lookup helper.
- `supabase/sql/13_pos_rules.sql` / `14_settings_scopes.sql`: add a `TERMINAL` scope and a chain-resolving read function callable by staff and activated terminals.
- `supabase/sql/16_security_alerts.sql`: `security_selfcheck` auto-resolves findings whose condition no longer holds and records `last_checked_at`.
- Folded into `supabase/sql/99_run_all.sql` and applied as a migration on the Lovable backend; the same files stay runnable against the separate POS database.