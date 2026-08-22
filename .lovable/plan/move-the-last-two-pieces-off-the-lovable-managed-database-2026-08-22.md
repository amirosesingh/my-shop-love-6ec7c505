# Move the last two pieces off the Lovable-managed database

I read the whole database layer. The good news: almost everything already talks to **your own Supabase project**. Two server files are the exception — and they are exactly the ones behind the "Server vs. shop data comparison" page.

## Where things stand today (verified)

Talking to **your project** (`external-supabase-config.ts` pins your URL + publishable key, and a registered terminal's own tenant overrides it):

- Browser/app reads and writes — `src/integrations/supabase/external-client.ts` (`supabaseExternal`)
- Server write relay and all till reads — `src/lib/pos-relay.server.ts` (uses your service key via `POS_SUPABASE_SERVICE_ROLE_KEY`, read at call time)
- Session/boot verification, cashier login, settings, sync endpoints — all go through that relay
- A guard test (`src/lib/__tests__/own-database.security.test.ts`) already fails the build if app code imports the managed client

Still talking to the **Lovable-managed project**:

1. `src/lib/data-compare.server.ts` — imports `supabaseAdmin` from `@/integrations/supabase/client.server` for every table count/latest-timestamp read
2. `src/lib/data-compare-access.server.ts` — same admin client, used to look up the caller's branch and role in `app_users`

Because those two use the managed service key, the comparison page counts rows in the **wrong database**, which is why the shop-vs-server numbers cannot be trusted.

Also present but harmless: `.env` and `supabase/config.toml` still name the managed project. Both are auto-managed and cannot be edited here; nothing in the app reads them any more, because your pinned project wins ahead of every environment variable.

## What the change does

1. Replace the admin client in `data-compare.server.ts` with reads through your project's service key, reusing the existing `serviceRest` helper in `pos-relay.server.ts` (same host, same key, same branch filter logic — count-only projections, so no customer or sale detail leaves the server).
2. Replace the `app_users` lookup in `data-compare-access.server.ts` with the same relay-based read, so the caller's branch and admin flag come from your database.
3. Extend the guard test so `data-compare*.server.ts` can never re-import the managed client, closing the hole permanently.
4. Add the comparison page's needs to the health probe wording so a missing `POS_SUPABASE_SERVICE_ROLE_KEY` shows as "comparison unavailable" instead of silently returning zeros.
5. Bump the app version.

## Technical notes

- `serviceRest(path, init)` already targets `supabaseConfig().url` with your service key and per-request env resolution on Cloudflare, so no new client construction is needed.
- Row counts use PostgREST `Prefer: count=exact` with `HEAD`, which matches what `supabaseAdmin.select(..., { count: 'exact', head: true })` produced — the numbers stay comparable to what the page shows today.
- The parent-table branch filter (`table!inner(store_id)`) translates directly to the same embedded-filter query string, so scoping behaviour is unchanged.
- No schema change, no policy change, no migration to run on your database.

## Nothing else needs moving

There is no other code path reaching the managed backend — no edge functions, no managed `createServerFn` reads, and the Electron side reads its keys from your sealed key store.
