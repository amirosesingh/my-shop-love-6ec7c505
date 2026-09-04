# Connection Profile Manager: reliable persistence, restore and safe reconfiguration

## What the audit found (current flow and root causes)

Today the three values already exist as one `ConnectionProfile` type with one writer
(`saveConnectionProfile` in `src/lib/secure-cloud-config.ts`), which validates, tests the
database, tests the backend and only then writes. That part is sound and is kept. The
failures come from persistence, restore ordering and the settings form.

1. **Android loses the POS backend URL after restart (primary root cause).**
   The backend address is written to plain `localStorage` under `pos.backend.url`
   (`src/lib/backend-config.ts`). On Android, `localStorage` is not authoritative:
   `hydrateNativeStorage()` mirrors only keys that pass `isPersistentKey()` in
   `src/lib/live-mode.ts`, and `pos.backend.url` is in neither `UI_STORAGE_KEYS` nor
   `DEVICE_STATE_KEYS`. Worse, `purgeBusinessKeys()` runs on every launch and deletes
   every `pos.*` key that is not persistent — so the saved backend URL is actively
   erased at start-up. The Supabase pair survives (Keystore), the backend URL does not.

2. **Start-up reads the address before restoration finishes (secondary root cause).**
   `NativeBoot` calls `hydrateBackendUrl()` *first* and `hydrateNativeStorage()` *after*,
   so even with fix 1 the address would be read from a not-yet-restored store. Electron
   has the mirror-image gap: `initCloudConfigFromShell()` runs inside an `AppShell`
   effect that is not awaited before the startup gate evaluates.

3. **Emergency Access / setup appears during the hydration window.**
   `hasRequiredPlatformConfig()` reports `missing`/`incomplete` for an unhydrated device
   with no way to say "still loading", and `useStartupGate` starts with
   `cloudConfigured: null` but the decision path treats an unconfigured-looking device as
   `connect-database`. A perfectly configured till can therefore flash the setup screen.

4. **Changing only the backend URL asks for the Supabase key again.**
   `connectionProfile()` returns `keyHint` (a mask like `sb_pub…a1b2`) in the
   `supabaseKey` field. Committing that would store the mask, so the panel forces a
   re-entry of the key for a backend-only edit.

5. **Sync can start mid-commit.** `saveCloudCredentials()` calls `afterCredentialsSaved()`
   (which kicks `runExclusive`) *inside* the commit, before the backend half is confirmed
   and readiness re-checked.

## What will change

### A. One hydration step, one readiness answer
New `src/lib/connection-profile.ts` owns the lifecycle and re-exports through the
existing modules so no caller breaks:
- `hydrateConnectionProfile()` — restores platform storage, then applies the Supabase
  runtime override and `window.__POS_SERVER_URL__`, then marks hydration complete.
  Idempotent, memoised, safe to await from several places.
- `connectionProfileState()` / `awaitProfileHydrated()` — hydration status.

`hasRequiredPlatformConfig()` gains a `hydrating` state and returns it until restore has
finished; `platformConfigReadySync()` returns the last hydrated answer rather than a
Supabase-only guess. Readiness stays a single function checking all three values.

### B. Android persistence made authoritative
- The backend URL becomes part of device state: added to `DEVICE_STATE_KEYS` so it is
  mirrored into Capacitor Preferences and never purged.
- It is additionally written to the same secure store as the cloud pair (a
  `pos.backend.url` entry in `capacitor-secure-storage-plugin`), with Preferences as the
  fallback read. Reads prefer secure storage, then Preferences, then `localStorage`.
- `NativeBoot` ordering is corrected: `hydrateNativeStorage()` → `hydrateConnectionProfile()`
  → cleanup → activation → bundle. `runDeviceCleanup()` keeps the new key.

### C. Electron unchanged in architecture, corrected in ordering
Cloud pair stays in DPAPI via the main process; backend URL stays in the sealed config
store; renderer isolation, SQL access and the credential boundary are untouched. Only
the restore step moves earlier: `hydrateConnectionProfile()` runs before the startup gate
evaluates, using the existing `bootstrapCloudCredentials` and `backendUrl` bridges.

### D. Test → Commit → Activate, with unchanged values preserved
`saveConnectionProfile` accepts `supabaseKey: null` meaning "keep the stored key". The
candidate profile is completed from the live stored values before testing, so a
backend-only edit tests Supabase A + Backend B and commits both. Same in reverse for a
cloud-only edit. Commit order stays two-phase with rollback: snapshot the current
profile, write backend, write cloud, restore the snapshot if either fails — so a failed
change leaves the old working profile intact and active. `afterCredentialsSaved()` moves
out of `saveCloudCredentials` into the end of `saveConnectionProfile`, after activation
and the readiness re-check, so sync never starts mid-commit.

### E. Settings and setup screens
`CloudConnectionPanel` (used by both `ConnectDatabaseScreen` and
`/settings/database`) gets two distinct actions:
- **Test connection** — probes the candidate profile, reports the Supabase result and the
  backend result separately, writes nothing.
- **Save & Connect** — validate → test → commit → activate → readiness, then reports
  Saved / Activated / Connected.

Fields prefill from the saved profile (URL, masked key, backend URL); the key field left
untouched means "keep the stored key". Manager authorisation for post-setup edits is
unchanged. Existing test semantics are kept: an unprovisioned POS schema is a warning,
not a rejection; the backend test keeps using `/api/public/sync-health`.

## Tests
New/updated vitest coverage under `src/lib/__tests__/` with fake Electron and Capacitor
stores: first launch shows setup; a complete profile persists; simulated restart restores
both halves and does not show setup; backend URL survives restart on Android;
A → B backend change survives restart; a failed backend change leaves A stored and active;
a cloud-only change preserves the backend; an incomplete or corrupt profile requires setup;
a slow hydration must not report unconfigured; sync starts only after commit + activation.

## Out of scope
SQL Server, SQLite/offline, RLS, service-role, server secrets, Electron renderer
isolation and main-process DB access, authentication, printing, inventory, sales, shifts
and unrelated UI are untouched.

## Verification and report
Typecheck, full vitest run, `MOBILE_BUILD=1` / `DESKTOP_BUILD=1` bundle builds with the
existing artefact scan, and a version bump. Restart behaviour is verified through the
storage adapters in tests — this sandbox has no Android or Windows hardware, and the
closing report will state that plainly alongside root cause, files changed, both
persistence paths, restore point, readiness gating, the two actions, failure preservation,
key preservation and sync sequencing.

## Files expected to change
`src/lib/connection-profile.ts` (new), `src/lib/secure-cloud-config.ts`,
`src/lib/backend-config.ts`, `src/lib/platform-config-ready.ts`, `src/lib/live-mode.ts`,
`src/platforms/mobile/components/NativeBoot.tsx`,
`src/platforms/mobile/device-cleanup.ts`,
`src/platforms/web/components/pos/AppShell.tsx` (restore ordering only),
`src/platforms/web/components/pos/settings/panels/CloudConnectionPanel.tsx`,
`src/platforms/web/components/pos/ConnectDatabaseScreen.tsx`,
`src/core/activation/registration-status.ts` (hydrating state), plus tests.
