# Configuration audit: what the app reads today, and what must change for multi-customer sale

No code changed. This is the dependency map you asked for, from reading the actual files.

## A. How it works today

```text
WEB (Cloudflare Worker)
  request -> src/server.ts setRuntimeEnv(env)
          -> external-supabase-config.ts resolves a PAIR
          -> public-config-script.ts prints {SUPABASE_URL, SUPABASE_ANON_KEY} into the page
          -> browser reads window.__POS_CONFIG__
  server-only: POS_SUPABASE_SERVICE_ROLE_KEY, SETTINGS_ENCRYPTION_KEY (relay + crypto)
  API calls: relative URLs (server-origin.ts returns "")

ANDROID / WINDOWS (terminal apps)
  Settings -> Database & Cloud Connection (CloudConnectionPanel)
     URL + publishable key -> secure-cloud-config.ts
        Windows: electron/cloud-credentials.cjs (DPAPI safeStorage, cloud-credentials.bin)
        Android: capacitor-secure-storage-plugin (Keystore) keys pos.cloud.url / pos.cloud.key
     -> setTerminalSupabaseOverride() -> supabaseConfig() (override always wins)
     Backend address -> backend-config.ts
        Windows: sealed Electron config store via window.pos bridge
        Android: localStorage "pos.backend.url"
     -> window.__POS_SERVER_URL__ -> server-origin.ts -> every /api call
  Local SQL Server: electron/db-config-store.cjs (safeStorage-sealed file)
  supabaseConfig() THROWS on a terminal when no override exists — by design.
```

## B. Value-by-value map

| Value | Read from | Build/runtime | Platforms | Stored | Missing behaviour | Secret? | Screen |
|---|---|---|---|---|---|---|---|
| Supabase URL | `PAIRS` in external-supabase-config: `VITE_POS_SUPABASE_URL` then `SUPABASE_URL`; terminal override wins | both (Vite static reads + runtime env + injected page config) | all | terminal: OS vault / Keystore; web: hosting env | `SupabaseConfigError`, error page / setup screen | no | Database & Cloud Connection |
| Supabase publishable/anon key | same pair, `*_ANON_KEY` or `*_PUBLISHABLE_KEY` | both | all | same | same | no (public) | same |
| `POS_SUPABASE_SERVICE_ROLE_KEY` | `runtimeEnvValue` / `process.env` in `pos-relay.server.ts` | runtime, server only | web/worker only | hosting secret | relay writes refuse; `sync-health.serviceKey=false` | YES | none (correct) |
| `SETTINGS_ENCRYPTION_KEY` | `process.env` in settings-crypto/pos-session/pos-rules/terminal-account | runtime, server only | worker | hosting secret | those server fns fail | YES | none |
| POS backend URL | `backend-config.ts`; fallback build const `VITE_POS_SERVER_URL` in `server-origin.ts` | runtime per device (+ stale build fallback) | Android/Windows | sealed store / localStorage | `serverUnreachableOnDevice()`, sign-in + sync blocked | no | Database & Cloud Connection, Recovery Hub |
| Local SQL Server (host, instance, port, auth) | `electron/db-config-store.cjs` | runtime | Windows | safeStorage-sealed file | local mode unavailable | YES (may hold a password) | Settings → Database (Local) |
| Offline SQLite/mirror | derived from local SQL config + `db-mode.ts` (`localStorage`) | runtime | Windows/Android | localStorage + local DB files | falls back to online mode | no | Settings → Data & Sync |
| Terminal/device ID + activation token | `core/activation/terminal-tokens.ts` (`localStorage` CONFIG_KEY/PAIR_KEY), device secrets in `lib/device-secrets.ts` | runtime | terminals | localStorage (wrapped by device secret) | registration screen | semi (token) | Activation / Recovery |
| Branch / store id | activation record + `active-branch.ts` | runtime | all | localStorage | branch-scoped queries empty | no | Settings → Terminals/Branches |
| Auth session | Supabase client for the resolved project (`external-client.ts`), bearer attached by `external-auth-attacher` in `src/start.ts` | runtime | all | Supabase storage | login fails | yes (token) | login |
| Tenant/customer id | **does not exist** — the Supabase project itself *is* the tenant | – | – | – | – | – | – |

## C. Why removing `.env` broke login

`.env` is tracked in git and contains `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Those are exactly the second accepted pair in `PAIRS`. In dev/preview the Vite/worker process env is the only bag that carries them, so deleting `.env` leaves `supabaseConfig()` with nothing to resolve → `SupabaseConfigError` → no auth client → "invalid user"/setup errors. Nothing else supplied those values locally: the POS-prefixed pair is absent and the page-injected bag is produced *from* the same resolver.

So `.env` is only a **local development** source. It is not baked into APK/EXE (device builds use `envDir: scripts/no-env` and terminals ignore env entirely).

## D. Gaps against "one build, many customers"

1. `VITE_POS_SERVER_URL` in `server-origin.ts` is a build-time backend address fallback — a customer's address can be baked in. Must be removed for device builds.
2. `.env` tracked in git holds one customer's project → any clone/build inherits it. Must be untracked and replaced by `.env.example`.
3. Lovable-managed `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher}.ts` still read `VITE_SUPABASE_*`/`SUPABASE_*`. They are not registered in `src/start.ts`, but they remain importable and are a second, company-tied config path.
4. Web has **no runtime setup screen**: it is hard-wired to hosting env. For a self-hosted customer worker that is correct, but the pairing/first-run story should be documented and the error page should say so.
5. `CloudConnectionPanel` is read-only on web and the first-run gate (`ConnectDatabaseScreen` / `platform-config-ready.ts`) covers terminals only — no "protected admin re-configuration" path distinct from first run.
6. `testCloudCredentials()` probes `stores` — a customer whose schema is not yet provisioned fails the test even with correct credentials.
7. No import/export of a signed **configuration bundle** (URL + key + backend address) so a customer can be provisioned by QR/file instead of typing three fields.

## E. Files that must change when we implement

- `src/lib/external-supabase-config.ts` — keep pair resolution; drop nothing on web; ensure terminal path stays override-only.
- `src/lib/server-origin.ts` — remove the `VITE_POS_SERVER_URL` build fallback for terminal shells.
- `src/lib/backend-config.ts`, `src/lib/secure-cloud-config.ts` — unchanged storage, add a single `saveConnectionProfile()` that writes URL + key + backend address atomically and re-tests.
- `src/lib/platform-config-ready.ts` — include backend address in readiness, expose `state` to the gate.
- `src/platforms/web/components/pos/ConnectDatabaseScreen.tsx`, `.../settings/panels/CloudConnectionPanel.tsx` — first-run wizard vs. admin-gated edit (manager PIN), Test → Save → Continue.
- `src/routes/settings.database.tsx` — connectivity section behind an authorization gate.
- `.env` (untrack), `.env.example`, `scripts/web-only-env.cjs`, `vite.config.ts`, both workflows — no customer values in the repo or in device builds.
- `src/integrations/supabase/*` managed files — quarantine with a lint/test guard so nothing imports them.
- New tests: no baked tenant in a device build; terminal without a profile shows setup; profile survives update but is cleared on data wipe.

## F. Security position (verified)

Service-role key and `SETTINGS_ENCRYPTION_KEY` are read only in `*.server.ts` on the worker; neither appears in any client bundle path. `sync-health` reports presence booleans only. The publishable key is correctly treated as public. Local SQL credentials never leave the Electron main process. No change needed here beyond keeping it that way.

## G. Answer to the core question

Nothing in the runtime architecture ties a *terminal* to your company — the override chain is already per-device. The ties are: the tracked `.env`, the `VITE_POS_SERVER_URL` build fallback, the managed Supabase integration files, and the absence of a first-run/admin configuration flow on web. Fixing those four is the whole job; the SQL Server/SQLite offline architecture is untouched by it.

Next step, on your approval: I turn section E into an implementation plan (no code yet if you prefer another review round).
