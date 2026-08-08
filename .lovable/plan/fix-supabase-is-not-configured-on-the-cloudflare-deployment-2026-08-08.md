# Fix: "Supabase is not configured" on the Cloudflare deployment

## Why it happens

The keys are saved in Cloudflare, but the app cannot see them at the moment it needs them:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are **build-time** values. Vite bakes them into the browser files while the site is being built. A Cloudflare *secret* only exists when the site is already running, so nothing was baked in and the browser build has no address at all.
- The full-page "Something went wrong on our end" is the server side hitting the same wall while rendering the first page, so the error appears before anything else can load.

So this is not a wrong key — it is the keys arriving too late for the way the app currently reads them.

## The fix: read the configuration at run time, not build time

1. **Server reads Cloudflare's own environment.** The worker entry (`src/server.ts`) receives Cloudflare's `env` object on every request. It will hand those values to the configuration module, so `SUPABASE_URL` / `SUPABASE_ANON_KEY` set as Cloudflare variables or secrets work immediately, with no rebuild.
2. **Browser receives the public values from the server.** The server injects the project URL and publishable key into the page as a small script tag (`window.__POS_CONFIG__`). The browser config resolver reads that first, then falls back to build-time `VITE_*` values for local development and the desktop/Android builds. Only the public URL + publishable key are injected — the service key stays server-only.
3. **Clear message instead of a blank crash.** If nothing is configured anywhere, the page shows a short readable notice naming the two variables to set and where, rather than the generic "went wrong" card.
4. **Health probe extended.** `/api/public/sync-health` will also report `posUrl` source (`runtime` / `build` / `missing`) so you can confirm in one look which side is missing.

## What you set in Cloudflare after this

In Workers → Settings → Variables & Secrets:

```text
SUPABASE_URL        = https://<your-project>.supabase.co   (plain variable is fine)
SUPABASE_ANON_KEY   = sb_publishable_...                   (plain variable is fine)
POS_SUPABASE_SERVICE_ROLE_KEY = ...                        (secret)
SETTINGS_ENCRYPTION_KEY       = ...                        (secret)
```

The `VITE_*` pair becomes optional for Cloudflare; it stays needed only for local `bun run dev` and for the Electron/Android bundles, where it is provided at build time.

## Technical notes

- Files touched: `src/server.ts` (capture `env`), `src/lib/external-supabase-config.ts` (runtime bag + injected browser bag, keep the ordered pair lookup and hard error), `src/routes/__root.tsx` (inject the public config script), `src/routes/api/public/sync-health.ts` (report the source).
- No database migration, no schema change, no change to how queries are authorised; every call keeps going through the same client and relay, so RLS behaviour is identical.
- The existing guard test that forbids hardcoded `*.supabase.co` URLs and key literals in `src/` stays in force — nothing is baked in by this change.
