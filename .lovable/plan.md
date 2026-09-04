# Supabase Configuration Scan — Report First

Scan complete. No files were changed.

Headline: your Database & Cloud Connection chain is already the single source of truth for every Supabase call the POS itself makes. The "Missing Supabase environment variable(s)" error does **not** come from your chain — it comes from three auto-generated Lovable-Cloud integration files, one of which is wired into every server-function call in `src/start.ts`.

## A. Current configuration flow

```text
Settings → Database & Cloud Connection  (CloudConnectionPanel.tsx)
        saveCloudCredentials(url, key)   [src/lib/secure-cloud-config.ts]
                 |
    Windows ─────┴─── window.pos.setCloudCredentials  → ipc "cloud:set"
                          → electron/cloud-credentials.cjs (safeStorage/DPAPI,
                            cloud-credentials.bin in userData)
    Android ─────────── capacitor-secure-storage-plugin (Keystore /
                        EncryptedSharedPreferences), keys pos.cloud.url/.key
    Web ─────────────── not used; server prints SUPABASE_URL + SUPABASE_ANON_KEY
                        into the page via publicConfigScript()

    boot: initCloudConfigFromShell()
        Windows: ipc "cloud:bootstrap" returns the live pair to the renderer
        Android: androidRead()
                 → setTerminalSupabaseOverride(url, key)
                 → resetExternalClient()

    supabaseConfig()  [src/lib/external-supabase-config.ts]  ← single resolver
        1. terminalOverride (from the secure vault)  — wins always
        2. terminal app and no override → throws SupabaseConfigError
        3. web: window.__POS_CONFIG__ → VITE_POS_* → runtime env → process.env

    supabaseExternal / createTenantClient  [external-client.ts]
    pos-users.ts, relay, sync  → all read supabaseConfig()

SEPARATE, UNWANTED BRANCH (the error source)
    src/start.ts → functionMiddleware: [attachSupabaseAuth, ...]
        → src/integrations/supabase/auth-attacher.ts
        → src/integrations/supabase/client.ts  (managed Lovable client)
        → reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
        → device builds have no env  → "Missing Supabase environment variable(s)"
```

## B. Desired flow

Identical to the above, minus the second branch: the managed-client branch is removed from the live call path so `supabaseConfig()` is the only resolver. Nothing about storage, entry, or the secure vault changes.

## C. Environment-variable references

| Reference | File | Role | Verdict |
|---|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/client.ts:34-35` | managed Lovable client | offending path |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/auth-middleware.ts:36-37` | `requireSupabaseAuth` | dead — no app usage found |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `src/integrations/supabase/client.server.ts:33-34` | managed admin client | dead — no app usage found |
| `VITE_POS_SUPABASE_URL` / `VITE_POS_SUPABASE_ANON_KEY` | `external-supabase-config.ts:87-88,107` | local dev only, web | keep |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `external-supabase-config.ts:110` | Cloudflare runtime + injected page config | keep (web only) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `src/lib/system-audit-access.server.ts:13-14,42-43` | server-side audit read | keep (web/worker only) |
| `POS_SUPABASE_SERVICE_ROLE_KEY` | `src/core/api/pos-relay.server.ts:91` | server relay service key | keep, server-only |
| VITE_/SUPABASE_ name lists | `vite.config.ts:35-41`, `scripts/web-only-env.cjs:16-31` | strip env from device builds | keep — this is why device builds have no env, by design |

## D. Supabase client initialisations

| # | File / function | URL + key source | Env? | Uses Cloud Connection? | Reachable |
|---|---|---|---|---|---|
| 1 | `integrations/supabase/external-client.ts` — `supabaseExternal`, `createTenantClient`, `resetExternalClient` | `supabaseConfig()` | only on web | yes (terminal override) | yes — the main app client |
| 2 | `src/lib/pos-users.ts:12` fetch wrapper | `supabaseConfig().key` | no | yes | yes |
| 3 | `integrations/supabase/client.ts` — managed client | `import.meta.env.VITE_SUPABASE_*` / `process.env.SUPABASE_*` | yes | **no** | yes, via `attachSupabaseAuth` on every server-fn call |
| 4 | `integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth` | `process.env.SUPABASE_*` | yes | no | not referenced by any app code |
| 5 | `integrations/supabase/client.server.ts` — `supabaseAdmin` | `process.env` service role | yes | no | not referenced by any app code |
| 6 | `src/core/api/pos-relay.server.ts` | `POS_SUPABASE_SERVICE_ROLE_KEY` + `supabaseConfig().url` | server env | server-side, correct | yes, worker only |

## E. Every path that can produce "Missing Supabase environment variable(s)"

1. `client.ts:42` — fires whenever the managed client is first touched. On a till/APK, and on any host without `VITE_SUPABASE_*`, this is guaranteed. Trigger: `attachSupabaseAuth` calls `supabase.auth.getSession()` on **every** server-function invocation (`src/start.ts:33`). This is the error you are seeing "in some places in the app" — it tracks which screens call server functions.
2. `auth-middleware.ts:44` — only if a server fn adopts `requireSupabaseAuth`. None do today.
3. `client.server.ts:41` — only if `supabaseAdmin` is imported. Nothing does today.

Your own resolver never emits that text; when unconfigured it raises `SupabaseConfigError` with the friendly "Open Settings → Database & Cloud Connection" wording.

## F. Minimum safe change (for your approval — not yet applied)

1. `src/start.ts`: drop `attachSupabaseAuth` from `functionMiddleware`, keeping `attachExternalSupabaseAuth` (which already attaches the bearer from your own project) and `sessionExpiryMiddleware`. This alone removes the error.
2. Leave the three generated files on disk untouched (the platform regenerates them); they simply become unreachable. Add a short note in `AGENTS.md`/`src/routes/README.md` recording that the managed trio must never be imported by app code.
3. Add a regression test asserting that no file under `src/` outside `src/integrations/` imports `supabase/client`, `client.server`, `auth-middleware`, or `auth-attacher` — so this cannot silently return.
4. Optionally surface the friendly `SupabaseConfigError` message where a raw error currently reaches the UI.

Not touched: RLS, auth, schema, sync, relay, permissions, storage mechanisms, `.env` requirements.

## G. Answers to your Step 2 / Step 7 questions

- URL and key are entered in `CloudConnectionPanel.tsx` (fields `cloud-url`, `cloud-key`); the panel renders only on terminal apps.
- `saveCloudCredentials()` saves them; `testCloudCredentials()` verifies first with a real `stores` read.
- Electron storage: `electron/cloud-credentials.cjs`, sealed with `safeStorage` (Windows DPAPI) at `userData/cloud-credentials.bin`; plain JSON only where the OS vault is unavailable. Retrieved by `cloud:bootstrap` (full pair, main→renderer) and `cloud:status` (masked hint only).
- Android storage: `capacitor-secure-storage-plugin` (Keystore-backed EncryptedSharedPreferences), keys `pos.cloud.url` / `pos.cloud.key`; read by `androidRead()`.
- Web retrieval: `publicConfigScript()` prints `SUPABASE_URL` + `SUPABASE_ANON_KEY` into the page; the browser reads `window.__POS_CONFIG__`.
- Central resolver: **`supabaseConfig()` in `src/lib/external-supabase-config.ts`** — it already is the single source of truth and should stay so.
- If values are missing: terminal apps throw `SupabaseConfigError` with the Settings prompt and keep trading locally; web shows the hosting-variables banner in `__root.tsx:90`.
- Confirmed: yes, Electron `safeStorage`/DPAPI and the Android Keystore are genuinely used for these two values today.
