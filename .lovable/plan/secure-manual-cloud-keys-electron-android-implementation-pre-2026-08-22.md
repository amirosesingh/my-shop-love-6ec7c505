# Secure Manual Cloud Keys (Electron + Android) — Implementation Preview

## Confirmed scope (your answers)

- **Electron (Windows):** full refactor — manual key entry, safeStorage (DPAPI) sealing, startup guard, sync badges. Local-first already exists and stays.
- **Android (APK):** keys + Keystore encryption + startup guard + badges only. Android keeps its current live-only design (no local database port in this stage).
- **Key type:** Supabase Project URL + **publishable key** + existing terminal/cashier tokens. No service-role key is stored on any till or phone. (The bundled Windows app server keeps its existing sealed service-key panel — unchanged.)
- **Web/browser build:** unchanged — keeps build-time publishable config.

## Current state (from the audit)

- Already OS-encrypted: SQL Server config (`electron/db-config-store.cjs`), app-server keys (`electron/server-keys.cjs`), terminal activation (`electron/terminal-store.cjs`).
- Not encrypted: the central Supabase URL + publishable key are hardcoded in `src/lib/external-supabase-config.ts` (`POS_PROJECT`) and pushed renderer → main every launch (`AppShell.tsx` lines 167–184). The sync worker (`electron/sync/worker.cjs`) holds them in memory only; no sealed cloud store, no settings UI, no credential-error state.
- Android: Capacitor 8, `@capacitor/preferences` only (not encrypted); `live-mode.ts` pins live-only; `OfflineGate.tsx` covers the app when offline — both stay as designed.
- `src/integrations/supabase/client.ts` is platform-generated and cannot be edited; the POS data plane runs through `external-client.ts`, which is where dynamic initialization lands.

## Files to CREATE (5)

1. **`electron/cloud-credentials.cjs`** — safeStorage-sealed store for `{ supabaseUrl, publishableKey }`, mirroring `db-config-store.cjs`: `read()` / `write()` / `remove()` / `status()` (presence + masked hint like `sb_p…7Cg`, never the value). Plain-file fallback only when the OS vault is unavailable (same documented trade-off as existing stores).
2. **`src/lib/secure-cloud-config.ts`** — one cross-platform API for the renderer: `cloudKeyStatus()`, `saveCloudCredentials(url, key)`, `testCloudCredentials(url, key)` (throwaway client → `/auth/v1/health` + minimal REST probe), `removeCloudCredentials()`, `initCloudConfigFromShell()`. Electron → `window.pos` IPC; Android → Keystore plugin; web → no-op (returns "managed").
3. **`src/components/pos/settings/panels/CloudConnectionPanel.tsx`** — "Database & Cloud Connection" settings module (Admin/Manager via existing `PermissionGate`): URL + publishable-key fields (password input, never prefilled), **Test Connection** (validates before save, reports the exact failure), **Save** (encrypt + persist via the native bridge, then hot-restarts sync), **Remove** (deletes sealed entry, pauses sync).
4. **`src/components/pos/CloudSetupGate.tsx`** — startup guard for Electron + Android: on launch, query native secure storage; if keys are missing show a dismissible dialog "Cloud Sync Setup Required — configure your Online Database Keys in Settings" with **Open Settings** and **Continue Offline**. On Electron nothing is blocked (login, scanning, checkout, printing all proceed). On Android (live-only) Settings stays reachable; POS screens keep their existing connection-dependent behavior.
5. **`src/lib/__tests__/cloud-credentials.test.ts`** — sealed round-trip, masked status, missing-file behavior, renderer fallback (mocked bridges).

## Files to EDIT (10)

6. **`electron/preload.cjs`** — add `cloudKeyStatus`, `setCloudCredentials`, `testCloudCredentials`, `removeCloudCredentials`, `onCloudSetupRequired(cb)` to the existing `window.pos` bridge. Additive only.
7. **`electron/main.cjs`** — register the 4 IPC handlers; new `bootCloudFromSealedStore()` after `startAppServer()` so the sync worker starts from sealed creds without waiting for the renderer; on `ready-to-show`, emit `cloud:setup-required` when no sealed URL+key exist. Existing handlers untouched.
8. **`electron/sync/worker.cjs`** — credential guard: 400/401 / `invalid apikey` / JWT errors in `cloudUpsert()` and `pull()` set `credentialsInvalid = true`, park all cloud traffic silently (no retry storm, no uncaught errors), keep every local row queued (`is_synced = 0`), expose the state in `status()`; any successful call clears it and sync resumes automatically.
9. **`src/lib/external-supabase-config.ts`** — on terminal apps (`isTerminalApp()`), `supabaseConfig()` no longer falls back to the hardcoded `POS_PROJECT` pair; it resolves only from the sealed-store override applied via new `applySealedCloudConfig(url, key)` (routes through the existing `setTerminalSupabaseOverride`, so login/sync/relay switch tenant without restart). Web keeps `POS_PROJECT` exactly as today.
10. **`src/integrations/supabase/external-client.ts`** — make the lazy proxy tolerate missing config on terminal apps (throw only when a cloud call is actually attempted without keys, with a clear "keys not configured" error) so importing it never crashes an offline boot.
11. **`src/components/pos/AppShell.tsx`** — bootstrap: `initCloudConfigFromShell()` runs before the existing `configureCloud` effect; that effect skips pushing build-time creds when the shell reports sealed creds; mount `CloudSetupGate`; guard the boot-path `supabaseConfig()` call with `hasSupabaseConfig()`.
12. **`src/lib/sync-engine.ts`** (+ `src/lib/sync-relay.ts` if the auth error surfaces there) — renderer-side 400/401 interception for the Android/web path: auth/key errors set a `credentialsInvalid` sync state instead of a generic error loop; queued ops stay queued.
13. **`src/lib/sync-status.ts` + `src/components/pos/sync/SyncBadge.tsx`** — two new badge states: **"Offline / Unconnected"** (no keys) with a "Connect Database" link to Settings, and **"Sync Paused — Check Credentials"** (credential errors). Existing online/syncing/offline/error tones untouched.
14. **`src/routes/settings.system.tsx`** — mount `CloudConnectionPanel` above `ServerKeysPanel` in the "system" tab (one-line JSX addition).
15. **`package.json` + `scripts/mobile-build.cjs`** — add a Keystore-backed Capacitor secure-storage plugin (`capacitor-secure-storage-plugin`, EncryptedSharedPreferences/Android Keystore) to dependencies and the APK build script. Compatibility with Capacitor 8 is verified at install time; if the plugin proves incompatible, the fallback is a tiny in-repo plugin module — I'll flag it before proceeding.

## Zero-disruption guarantees

- **Untouched:** cashier login (`CashierPinLogin`, `staff:verify-pin`), shift open/close, `pos-auth.tsx`, user/role creation flows, RLS policies, checkout (`db:create-sale`), printing, schema manager, every existing IPC handler signature.
- Offline PIN login against local SQL, role assignments, and cloud-side user sync behave byte-for-byte as today — only **where cloud credentials live** and **when the sync worker runs** change.
- Web build behavior is identical; Android keeps live-only operation; Electron local-first mode (`db-mode.ts`) is not modified.
- No new secrets committed — `secrets.security.test.ts` keeps passing (publishable keys are explicitly allowed; the hardcoded pair remains only for the web build path).

## Verification

1. New vitest file + existing suite green; `node --check` on every edited `electron/*.cjs`.
2. Version bump via `node scripts/bump-version.cjs` (project convention).
3. Manual smoke list for you: Electron with no keys → popup, POS fully usable offline; save keys in Settings → badge flips Online; wrong key → "Sync Paused — Check Credentials", sales keep queuing; corrected key → sync resumes. Android APK: missing keys → setup prompt with Settings reachable; saved keys persist across restarts (Keystore).
