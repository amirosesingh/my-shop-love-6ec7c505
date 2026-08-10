# Fix the "central database key missing" warning on the server backup route

## What I checked just now

- The running app server **does** hold the central database key: `/api/public/sync-health`
  returns `serviceKey: true`.
- Posting a probe to `/api/public/sync` on that same server returns the normal
  "prove who you are" reply (401), **not** the 503 "key missing" reply.

So the exact message you see (`code: NO_SERVICE_KEY`, 503) can only come from a
**different server than the one I can reach here** — the built preview/published
worker, or the desktop/Android app pointed at a deployed URL, whose runtime never
received the key. The plan confirms which, then removes the dead end.

## Step 1 — Confirm which server is answering

Add the host that answered to the connection check result, and show a one-line
hint under a key-missing warning: "Open /api/public/sync-health on this device to
confirm." That turns a vague warning into a fact we can act on in one click.

## Step 2 — Rebind the key for the deployment that is missing it

Re-bind the central database service key so the preview and published workers pick
it up, then re-run the check until the backup route reports green. Also accept the
key under a third fallback name so a differently named binding on a self-hosted
Cloudflare deployment still works.

## Step 3 — Stop the warning from blocking real work

Today a key-missing reply just queues the work. When the person at the screen is
signed in with a real staff account (admin/supervisor in a browser), the app can
write straight to the central database with their own session instead — the relay
is only needed for PIN sign-ins that have no account. So:

- On `NO_SERVICE_KEY`, retry the same write directly with the signed-in session.
- Only fall back to the local queue when there is no session either (PIN till).
- Reword the message per case: staff session → silent direct write; PIN till →
  "Syncing paused — an administrator must re-save the central database key.
  Your work is saved on this device and will upload automatically."

## Step 4 — Make the health probe part of the check panel

The connection check calls `/api/public/sync-health` itself and shows one extra
line: "Server setup — key present / key missing on this server", so nobody has to
open a URL by hand next time.

## Technical notes

- `src/lib/pos-relay.server.ts`: add one more accepted binding name; no change to
  how writes are authorised.
- `src/lib/sync-relay.ts`: `probeRelay` also fetches `sync-health`; `relayOp`
  surfaces `NO_SERVICE_KEY` to callers.
- `src/lib/sync-engine.ts` / `src/lib/pos-db.ts`: on `NO_SERVICE_KEY`, fall back to
  a direct write when a Supabase staff session exists before queueing.
- `src/components/pos/ConnectionCheck.tsx`: extra "Server setup" line and host hint.
- No schema change, no migration, no new secret from you.
