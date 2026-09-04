# Fix "invalid user" at sign-in: the app is pointing at the wrong database

## What is actually happening

Sign-in is not broken — it is being sent to the **wrong project**. The auth
logs show repeated `400 invalid_credentials` against the Lovable-managed
project, and the console shows `permission denied for table audit_logs` for an
anonymous visitor. Your staff accounts do not live in that project, so every
password is "invalid".

The cause is in the last change to the connection resolver
(`src/lib/external-supabase-config.ts`). Before that change the resolver only
accepted a **pair** of names, in this order:

```text
VITE_POS_SUPABASE_URL + VITE_POS_SUPABASE_ANON_KEY   (your own project)
SUPABASE_URL          + SUPABASE_ANON_KEY            (Cloudflare variables)
```

The change replaced the pairs with two long, independent lists of accepted
spellings — including `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`,
which are the Lovable-managed values present in the editor/preview
environment. Two problems follow:

1. The preview now silently connects to the managed project instead of your
   own — this is the sign-in failure.
2. Because the address and the key are now looked up **separately**, a URL from
   one source can be paired with a key from another source, which can never
   work.

## The fix (small and targeted)

Restore pair-based resolution in `src/lib/external-supabase-config.ts` — one
file, no behaviour change anywhere else:

- Accepted pairs, tried in this order:
  - `VITE_POS_SUPABASE_URL` + `VITE_POS_SUPABASE_ANON_KEY` (or
    `VITE_POS_SUPABASE_PUBLISHABLE_KEY` as the same half)
  - `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`, the
    spelling Cloudflare/hosting may use)
- Drop `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the
  `VITE_SUPABASE_EXTERNAL_*` names from the accepted list, and drop the static
  `VITE_SUPABASE_*` reads added in the same change, so the managed
  project can never be picked up.
- Both halves must come from the same source bag, as before.

Nothing else changes: terminal override, sealed device storage, Cloudflare
runtime variables, the printed page config, sign-in code, RLS, sync and relay
all stay exactly as they are.

## After the fix

On Cloudflare the web build keeps reading `SUPABASE_URL` and
`SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) from Variables & Secrets —
that path is preserved deliberately.

In the Lovable preview there are no POS-prefixed values and no Cloudflare
variables, so the app will show the plain "Supabase is not configured" message
rather than logging you into the wrong database. If you also want the preview
to reach your own project, tell me and I will add the POS-prefixed pair to the
local `.env` — that is a one-line addition, not a new configuration system.

## Verification

- Typecheck and the existing test suite.
- A headless load confirming the app resolves your own project's address (or
  reports "not configured") and no longer contacts the managed project.
- Version bump.
