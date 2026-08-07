# Secrets and keys

Nothing secret is stored in this repository. The repo is safe to push to GitHub.

## What is in the code (public by design)

| Value | Where | Why it is safe |
| --- | --- | --- |
| POS Supabase project URL | `src/lib/external-supabase-config.ts`, `src/integrations/supabase/external-client.ts` | A public endpoint |
| Publishable (anon) key | same files | Designed to ship in browser code; every table is protected by row access rules |

Both are read from environment variables first, and only fall back to the
built-in values so the published build keeps working:

- browser: `VITE_SUPABASE_EXTERNAL_URL`, `VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY`
- server: `POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY`

## What must live in a secret store

| Secret | Used by | Where to set it |
| --- | --- | --- |
| `POS_SUPABASE_SERVICE_ROLE_KEY` | `src/lib/pos-relay.server.ts` (server write relay) | Lovable secrets, and Cloudflare → Workers → Settings → Variables & Secrets for self-hosting |
| `SETTINGS_ENCRYPTION_KEY` | `src/lib/settings-crypto.server.ts` (AES-256-GCM for stored credentials) | same |

These are read with `process.env` inside server handlers only. They are never
bundled into the browser build, never logged, and never returned to the client.

## Rules

- `.env` is git-ignored. Use `.env.example` (names only) as the template.
- `src/lib/__tests__/secrets.security.test.ts` fails the build if a service-role
  key or JWT-shaped credential is ever committed under `src/`.
- Rotating a key means updating it in the secret store and redeploying; no code
  change is required.