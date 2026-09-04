<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Supabase configuration (do not regress)

`supabaseConfig()` in `src/lib/external-supabase-config.ts` is the single
resolver for the Supabase URL and publishable key. On a till or phone the
values come only from Settings → Database & Cloud Connection, sealed in the
Electron OS vault (DPAPI) or the Android Keystore and applied through
`setTerminalSupabaseOverride()`. The web deployment supplies them through
hosting variables printed into the page.

The Lovable-managed files `src/integrations/supabase/client.ts`,
`client.server.ts`, `auth-middleware.ts` and `auth-attacher.ts` are generated
and must never be imported by application code or registered in
`src/start.ts` — they read `VITE_SUPABASE_*` / `SUPABASE_*`, which device
builds deliberately do not carry, and produce
"Missing Supabase environment variable(s)". The guard lives in
`src/lib/__tests__/own-database.security.test.ts`.
