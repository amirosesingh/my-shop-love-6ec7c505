# Database Connectivity Gating + Emergency Access Update

## What the code already does (verified before planning)

- **No hardcoded tenant credentials.** `src/lib/external-supabase-config.ts` has no defaults and no fallbacks: the URL and key come from the web deployment's environment, from the terminal's activation, or from Settings on the device. Goal #2's "remove hardcoding" item is already satisfied.
- **Re-configurable connection.** `ConnectDatabaseScreen.tsx` (startup) and `DatabaseConnectionSettings.tsx` (Settings) both accept a new URL/key at any time; Electron seals them with the OS vault (`electron/cloud-credentials.cjs`), Android with the Keystore.
- **Single data-access layer exists.** Every read/write already goes through `src/core/api/db-router.ts`.
- **Startup already branches** on two independent checks in `src/core/activation/registration-status.ts` (`isRegistered()` / `isCloudConnected()`), rendering Connect Database → Terminal Activation → Login in `AppShell.tsx`.
- **Emergency PIN already exists** as a 6-digit code that changes every minute, derived per device (`src/lib/emergency-pin.ts`, `electron/emergency-pin.cjs`), works fully offline, and gates `/recovery` via `EmergencyPinGate.tsx`.

So this update is not a rebuild — it closes four specific gaps.

## Gap 1 — Login succeeds without a working database (bug 5A)

Root cause, from reading `AppShell.tsx` and `registration-status.ts`:

1. The startup gate only asks whether an **activation record** exists (`terminal.config`). Once a till has ever been activated, the Connect Database screen is skipped forever, whatever the connection is doing.
2. `isCloudConnected()` returns true when the browser/OS merely reports "online" — it never proves the saved URL and key actually answer. A blank, wrong or revoked key still reads as connected.
3. Saving credentials in the setup form does not probe the project, so a typo is stored as if valid.
4. `CloudSetupGate` is a dismissible dialog ("Continue Offline"), not a block.

Fix:

- Add a **verified-connection probe** (a keyed request to the configured project, not a network ping) in `connection-health.ts`, with three results: `verified`, `unreachable`, `rejected` (bad key / wrong project). Cache briefly, re-run on focus and on a timer.
- The Connect Database screen saves credentials **only after** the probe returns `verified`; `rejected` shows the reason inline.
- Login is reachable only when the probe is `verified` — or, on Windows, when the till is registered and inside its offline grace window (see Gap 2).
- Handle mid-session loss: on Android a lost/rejected connection returns the app to the blocked screen; on Windows it flips to a labelled Offline Mode.

## Gap 2 — Per-platform behaviour

- **Windows/Electron:** registered till may sign in offline inside its grace window; a persistent "Offline Mode" bar is shown and every offline write goes to the existing sync queue, flushed automatically on reconnect. Never activated, or grace expired → hard block.
- **Android:** online-only. No connection → a "Database not connected" screen with Retry and the Emergency Access link. No login, no data screens, no cached-data browsing.
- **Web:** untouched. A guard test will fail the build if the new gating modules are imported by web-only code paths.

## Gap 3 — Emergency Access PIN (both codes accepted)

Keep today's per-device code and add a plain time code as a fallback master, both checked by the same verifier so either opens the gate:

- Device code (unchanged): HMAC of the device secret over the minute slot.
- Fallback code: 6 digits derived from the device's local clock alone, changing every minute, with the same ±3-minute drift tolerance. The formula and the shared salt used to scramble it into 6 digits go in one isolated module so a future TOTP phase replaces it without touching the gate.
- Both work with no internet, no cloud and no database. `scripts/emergency-pin.cjs` prints both.

Emergency Access scope stays exactly as it is: recovery settings only — terminal activation, cloud URL/key, local SQL, branch binding, hardware. No sales, no data browsing, no admin override. `/recovery` remains reachable from every blocked state on both platforms.

## Technical notes

- Files touched: `src/core/activation/connection-health.ts`, `registration-status.ts`, `src/platforms/web/components/pos/{AppShell,ConnectDatabaseScreen,CloudSetupGate,DatabaseConnectionSettings}.tsx`, `src/platforms/mobile/components/OfflineGate.tsx`, `src/lib/emergency-pin.ts`, `electron/emergency-pin.cjs`, `scripts/emergency-pin.cjs`.
- No Supabase migration, no schema, RLS or data change.
- Trading paths (cart, checkout, printing, drawer) are not modified.
- Tests: verified-vs-reachable probe results, login blocked on `rejected` and on blank config, Android offline block, Windows grace-window login, both PIN codes accepted and both rejected outside the drift window.
- Version bumped via `scripts/bump-version.cjs`.

## Open question left over from your spec

Section 7's first question ("eran ki publisher receivable ki") did not parse as a module in this codebase and nothing by that name exists. Treating it as out of scope unless you tell me what it refers to.
