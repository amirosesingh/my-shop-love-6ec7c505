# Supabase configuration deduplication

Goal: one name per real value. No redesign, no logic/schema changes, no removal of setup screens.

## What the scan found

Names referenced anywhere in the project (excluding docs):

| Name | Where | Verdict |
| --- | --- | --- |
| SUPABASE_URL / SUPABASE_ANON_KEY | server runtime, Cloudflare text vars, health probe, error copy | canonical (keep) |
| POS_SUPABASE_SERVICE_ROLE_KEY | server relay secret | canonical (keep, different purpose) |
| SETTINGS_ENCRYPTION_KEY | server secret | canonical (keep, unrelated) |
| VITE_POS_SUPABASE_URL / VITE_POS_SUPABASE_ANON_KEY | local dev override (`.env.local`), resolver, build scanners | keep — verified to hold a **different** value from the platform-managed `SUPABASE_URL` in the auto-generated `.env` |
| VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID / SUPABASE_PROJECT_ID / SUPABASE_PUBLISHABLE_KEY | auto-generated `.env` + auto-generated `src/integrations/supabase/*` | platform-managed, byte-identical to their non-VITE twins; these files are regenerated and must not be edited. Our own code stops reading them. |
| VITE_POS_SUPABASE_PUBLISHABLE_KEY | resolver + scanners only, never set anywhere | duplicate of the POS anon key -> remove |
| POS_SUPABASE_URL / POS_SUPABASE_PUBLISHABLE_KEY / POS_SUPABASE_ANON_KEY | resolver pair list only, never set | duplicate of SUPABASE_URL/ANON_KEY -> remove |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY | resolver pair list only | dead (not a Next.js app) -> remove |
| VITE_SUPABASE_EXTERNAL_URL / VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY / SUPABASE_EXTERNAL_URL / SUPABASE_EXTERNAL_PUBLISHABLE_KEY | resolver "rename bridge" | superseded duplicates -> remove |
| SUPABASE_POS_SERVICE_ROLE_KEY / POS_SERVICE_ROLE_KEY | legacy fallback names in the relay | duplicates of POS_SUPABASE_SERVICE_ROLE_KEY -> remove |

Verification method: `.env` and `.env.local` values were fingerprinted (hashed, never printed). `SUPABASE_URL`, `VITE_SUPABASE_URL` and `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID` matched exactly; `VITE_POS_SUPABASE_URL` did **not** match `SUPABASE_URL`, which is why the POS-prefixed pair stays.

## Final canonical list

- `SUPABASE_URL` — tenant project URL (Cloudflare text var)
- `SUPABASE_ANON_KEY` — tenant publishable/anon key, one name only (Cloudflare text var)
- `POS_SUPABASE_SERVICE_ROLE_KEY` — server-only secret
- `SETTINGS_ENCRYPTION_KEY` — server-only secret
- `VITE_POS_SUPABASE_URL` / `VITE_POS_SUPABASE_ANON_KEY` — local dev only, different value, never shipped to Android/Electron
- Platform-generated names inside `.env` and `src/integrations/supabase/*` are left untouched (regenerated files).

## Changes

1. `src/lib/external-supabase-config.ts`
   - Pair list reduced to: `VITE_POS_SUPABASE_URL`/`VITE_POS_SUPABASE_ANON_KEY`, then `SUPABASE_URL`/`SUPABASE_ANON_KEY`. Everything else removed.
   - Static `import.meta.env` bag reduced to the two POS names; drop the `VITE_SUPABASE_PUBLISHABLE_KEY` alias read.
   - `EXTERNAL_SUPABASE_URL_NAME` becomes `"SUPABASE_URL"`; error copy names only the canonical pair.
   - Terminal override, secure storage, throwing behaviour and `SupabaseConfigError` untouched.
2. `src/lib/public-config-script.ts` — inject `SUPABASE_URL` / `SUPABASE_ANON_KEY` keys into `window.__POS_CONFIG__` instead of the `VITE_` aliases (matching the new pair list), so Cloudflare-supplied Web config keeps flowing to the browser.
3. `src/lib/system-audit-access.server.ts` — read `SUPABASE_URL` / `SUPABASE_ANON_KEY` only, dropping the `VITE_*` and `PUBLISHABLE` fallbacks.
4. `src/core/api/pos-relay.server.ts` — keep `POS_SUPABASE_SERVICE_ROLE_KEY`; delete the two legacy alias names and their comment.
5. Build-isolation lists (`scripts/verify-no-web-config.cjs`, `scripts/mobile-build.cjs`, `scripts/desktop-release.cjs`, `vite.config.ts` blanking list) keep every legacy name. These are block-lists, not consumers: still refusing an old name is what stops a stale bundle leaking Web config into Android/Electron.
6. `.env.example` — rewritten to the canonical list with the dev-only POS pair explained.
7. `roadmap.md` — update the stale note about dropping the POS pair.
8. Bump version via `node scripts/bump-version.cjs`.

## Not changed

Auto-generated `.env`, `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `previewAuthStorage.ts`, `types.ts`; the Cloudflare variable names; Android/Electron secure-storage flow and the setup gate; database schema; business logic.

## Verification

- Typecheck plus the existing suite, including `device-build-isolation` and `web-bundle-epoch` tests.
- Web preview still boots and resolves config from the runtime/injected bag.
- Terminal-mode build scan stays clean, and an unconfigured terminal still opens the configuration screen.
