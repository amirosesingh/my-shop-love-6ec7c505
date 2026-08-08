# Point every database call at your own Supabase project

Today the app reaches your Supabase project through a set of "external" variables, and five files carry your project URL and publishable key hardcoded as a fallback. That means a bad or missing configuration silently keeps working against a baked-in address instead of telling you. This change makes the configuration explicit and required.

## Variable names

Your project will be read from:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Important: the auto-managed `.env` in this workspace sets `VITE_SUPABASE_URL` to the Lovable-managed project, and that file cannot be edited here. So in the Lovable preview these names will resolve to the managed project unless overridden. To keep the preview honest, the loader will read in this order and stop at the first value found:

1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
2. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. existing `VITE_SUPABASE_EXTERNAL_URL` / `VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY` (kept only as a rename bridge, no hardcoded values)

Server-side equivalents (`SUPABASE_URL`, `POS_SUPABASE_URL`, …) follow the same ordered lookup. The service key stays server-only and is unchanged.

## What changes

1. **One configuration module.** `src/lib/external-supabase-config.ts` becomes the single source of the URL and anon key, with the ordered lookup above and no default values. If nothing is set, it throws a clear configuration error naming the missing variables.
2. **Hardcoded project values removed** from `src/integrations/supabase/external-client.ts`, `src/lib/pos-users.ts`, `src/lib/terminal-tokens.ts`, `src/routes/api/public/security-alerts.ts`, and `src/lib/pos-relay.server.ts`. All five import from the config module instead.
3. **Hard failure instead of silent fallback.** Missing configuration produces a readable full-page error in the browser and a `500` with a plain message on server routes, rather than quietly connecting somewhere else.
4. **All reads and writes keep going through the one client** (`supabaseExternal`) or the proven server relay, so your row-level security rules stay in force exactly as they are now. No query behaviour changes; no policy changes.
5. **Guard test extended.** The existing test that blocks imports of the Lovable-managed client also fails the build if a `*.supabase.co` URL or a publishable key literal reappears anywhere in `src/`.
6. **`.env.example` rewritten** with the exact variables local development and Cloudflare need, with placeholders and short comments (browser values vs server-only secrets).

## Not touched

- Local demo/default *settings* (receipt wording, default tax, seeded UI defaults in `src/lib/pos-seed.ts`) are first-run form defaults, not a mock database — they stay. There are no mock product/sale datasets in the app.
- Auto-generated files under `src/integrations/supabase/` that belong to the managed backend are left alone; the guard test keeps the app from importing them.

## After the change

You will need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set wherever the app runs (Cloudflare Pages/Workers env, desktop build env, local `.env`). Without them the app refuses to start instead of using the old baked-in address — that is the intent.
