# Configuration file: untracking and rotation

`.env` is still tracked in version control. Ignoring a file does nothing once it is tracked —
it has to be removed from tracking, and anything it ever held has to be treated as known.

## What the tracked file contains

| Name | Kind | Action |
| --- | --- | --- |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Project address | Public by design. No rotation needed, but stop shipping it from the repository. |
| `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID` | Project identifier | Public by design. |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key | Meant to be public, but it is the key row-level rules are enforced against. Rotate it, because a published key plus a policy mistake is a real read. |

No service key, encryption key or webhook secret is present in the tracked file — those live
only in the hosting secret store. The automated check below keeps it that way.

## Untrack the file

Run once, from the repository root:

```bash
git rm --cached .env
git commit -m "Stop tracking the environment file"
```

`.gitignore` already lists `.env` and `.env.*` with `!.env.example`, so it will not come back.
Keep your own values in `.env.local`, which was never tracked.

## Rotate

1. In the backend, rotate the publishable/anon key.
2. Update `SUPABASE_URL` / `SUPABASE_ANON_KEY` in the Cloudflare Worker's variables.
3. For local development, put the shop's own project under `VITE_POS_SUPABASE_URL` and
   `VITE_POS_SUPABASE_ANON_KEY` in `.env.local`.
4. Tills and phones take their address and key from activation or from
   Settings → Database & Cloud Connection, so nothing on a device needs editing.

## History

The file was committed, so the old value stays in the repository's history even after
untracking. Rotation in step 1 is what actually retires it; rewriting history is optional and
only worth doing if the repository is public.

## What the code already guarantees

- No project address or key is written in source. A test fails the build if one appears.
- Android and Windows builds load no `.env` at all and strip the web names from the build
  environment, so a device installer cannot carry web configuration.
- The service key is read on the server only, from the hosting secret store.
