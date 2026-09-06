# POS reliability pass: honest loading, no seven-day grace, quieter sessions

This is a repair-in-place pass. Nothing is rebuilt: sign-in, terminal registration, PIN entry, branch rules, sync and settings all keep their current implementations. The work is grouped into four stages so each one can be checked before the next starts.

## What I confirmed by reading the code

- The "No active location" screen is shown whenever the store list is empty, including while the store list is still loading. There is no loading state in that guard.
- The main data loader gives up after 15 seconds and marks the app "ready" even though nothing arrived, so a slow connection looks like a successful, empty shop.
- The seven-day offline grace is real and live: a default of 7 days, a stored setting, an expiry stamp on the sealed registration record, and a start-up rule that lets a till trade purely because that window is still open.
- Emergency Access is reachable from ordinary screens: the terminal registration screen, the mobile offline screen, the connection screen and the cloud setup screen. A test currently asserts those links exist.
- Sync progress is already published centrally and already survives leaving the page; the restore panel is the one place still holding its own progress in the page.
- The sign-in/sign-out race and the settings side-list scrollbar were already fixed in the previous pass and are left alone.

## Stage 1 — Honest start-up

- The location check gains three states: still loading, definitely empty, ready. "Add a location" and "No active location" only appear once the database has actually answered with nothing.
- A registered till keeps showing its own branch while the directory loads.
- The 15-second timeout stops meaning "ready". It becomes a "still loading, taking longer than usual" state, with retry, and a separate failed state. Critical data (account, branch, required settings, catalogue) gates the first usable screen; the rest keeps loading behind it.
- Connection checks keep their current first-probe, retry and shared-result behaviour. While the first check is genuinely pending the app says "Connecting…" and never "offline", "database unavailable" or "add location".

## Stage 2 — Remove the seven-day grace

Removed from the sealed registration record, the start-up rule, the settings and permission code, the desktop settings bridge, the tests and the comments that describe it as current behaviour. No replacement window is invented.

After removal the app distinguishes four honest states: connected, offline, offline-capable local operation (Windows local database, under its own existing explicit rule), and blocked because the required online check is unavailable.

## Stage 3 — Emergency Access out of ordinary screens, quieter expiry

- The Emergency Access button leaves the terminal registration screen, the mobile offline screen, the connection screen and the cloud setup screen. The recovery route and its protections stay in place as a separate maintenance entry; only the everyday links go. The test that asserts the links is updated to assert their absence.
- An expired sign-in is treated as a normal transition: no red console errors, no printed server address, no request details, no repeated retry of the same rejected call — just a clean lock/sign-out to the login screen with the terminal still registered.
- Sign-in and sign-out events are recorded through the existing audit trail (who, which terminal, which branch, when, why), with no passwords, PINs or tokens ever written.

## Stage 4 — Quieter sync, background continuity, cleanup

- Routine sync chatter (rule evaluation, heartbeats, ordinary ticks, successful passes) stops printing in normal use; real errors and warnings stay. Verbose diagnostics stay available behind an explicit debug switch.
- The restore panel reads the shared progress state instead of its own, so leaving the page and coming back shows the operation still running at its real position.
- Progress bars show real progress where it is known and a plain busy indicator where it is not; no invented percentages.
- If an operation is already running, the screen says so on arrival rather than on click; retry shows the running operation instead of starting a second one.
- Only code made dead by these changes is removed.

## Technical notes

- Files touched, in order: `LocationBootGuard.tsx`, `pos-store.tsx` (`loadCloudState` and the 15s watchdog), `connection-health.ts` (no behaviour change expected, verify only), `activation-record.ts`, `registration-status.ts` (`startupDecision`, `offlineGrace`), `pos-permissions.tsx`, `AppShell.tsx`, `use-revocation-check.ts`, `electron/ipc-privilege.cjs`, `RecoveryHub.tsx`, `TerminalActivation.tsx`, mobile `OfflineGate.tsx`, `ConnectDatabaseScreen.tsx`, `CloudSetupGate.tsx`, `session-expiry.ts` / `session-expiry.middleware.ts`, `sync-engine.ts`, `SyncPanel.tsx`, plus affected tests.
- Not touched: the auth provider's structure, terminal token RPCs and claim flow, PIN mechanism, `active-branch.ts`, the sync engine's mutex and retry rules, settings navigation, mobile drawer, routes, receipt design.
- Existing terminal RPC consistency (`terminal_token_status` / `_claim` / `_heartbeat`) was fixed in the previous pass; this pass verifies rather than re-migrates.
- Checks per stage: typecheck, `bunx vitest run`, `npm run logic:scan`, `npm run build`, then `node scripts/bump-version.cjs`.
- The final report will list only measurements actually taken.
