# Scan report: "Missing Supabase environment variable(s)"

## What I checked

I searched every file in `src/`, `electron/` and the build scripts for the code that can produce that exact message, and for every place the app decides which database to talk to.

## Where the message comes from

Exactly three generated files can print it, and all three belong to the Lovable-managed backend, not to your own central database:

- `src/integrations/supabase/client.ts` (browser) — reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
- `src/integrations/supabase/auth-middleware.ts` (server) — reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
- `src/integrations/supabase/client.server.ts` (server, service key)

## Which of them is actually live

Only one path is still wired in, and it explains what you are seeing:

- `src/start.ts` registers `attachSupabaseAuth`, which imports the managed browser client. It runs on **every** server-function call the app makes, so it builds the managed client and throws the missing-variable error whenever those managed names are absent — on a till, in a device build, or on a deployment that only has your own project's values.
- `auth-middleware.ts` and `client.server.ts` are not imported by any application file — dead, but still capable of failing if anything reaches for them later.
- Everything else in the app already goes through `src/lib/external-supabase-config.ts` → `supabaseExternal` / the server relay, which is what reads the central database URL and API key you enter in Settings → Database & Cloud Connection (or that a terminal receives at activation).

So this is not a missing setting on your side: it is one leftover middleware pointing at the wrong project.

## The fix

1. **Remove `attachSupabaseAuth` from `src/start.ts`**, keeping `attachExternalSupabaseAuth`. Server-function calls then carry the session from *your* project, resolved from the URL and key you entered — no managed variables involved anywhere.
2. **Extend the existing ownership guard test** (`src/lib/__tests__/own-database.security.test.ts`) so `auth-attacher`, `auth-middleware` and `client.server` are forbidden imports too. That makes the managed backend unreachable by construction, so this cannot come back.
3. **Make any remaining failure readable.** If the app ever runs with nothing configured, the message the user sees should be the existing `SupabaseConfigError` wording ("open Settings → Database & Cloud Connection and enter the central database URL and API key"), not the Lovable-managed variable names.
4. **Version bump** via `node scripts/bump-version.cjs`.

## Not changing

Your own configuration chain stays exactly as it is: terminal override from the sealed device store, then injected page values, then hosting variables. No database migration, no change to RLS, auth, sync or the relay.

## Verification

`bunx tsgo --noEmit`, `bunx vitest run`, then load the app and confirm a server-function call succeeds with no missing-variable error.
