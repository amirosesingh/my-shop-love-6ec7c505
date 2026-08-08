# Fix: "Server backup route — the central database key is not configured"

## What I checked

- The running app server **does** have the POS service key in its environment.
- Calling the sync route directly on that server returns the normal "prove who you are" response (401), **not** the "key is not configured" response (503).

So the message on your screen is not coming from the server I can reach here. Two explanations remain, and they need different fixes:

1. The browser check hit a **built preview/published deployment** whose runtime never received the POS key (it is saved as a project secret, but that deployment's server didn't get it bound).
2. The result on screen is from **before** the key was re-bound and hasn't been re-run.

The plan tells these apart first, then fixes whichever it is.

## Step 1 — Add a tiny key-presence probe

New public endpoint `GET /api/public/sync-health` returning only booleans, no secret material:

```text
{ "serviceKey": true|false, "posUrl": true|false, "runtime": "dev" | "edge" }
```

Run the connection check in the browser, then open this endpoint from the same origin. That definitively says whether the server answering your browser has the key.

## Step 2 — Make the key lookup resilient

In the relay helper:

- Read the key from the first available of `POS_SUPABASE_SERVICE_ROLE_KEY`, `POS_SERVICE_ROLE_KEY`, so a differently named binding on the deployment still works.
- Keep reading it inside the call (already the case) so a late-bound value is picked up without a rebuild.

## Step 3 — Rebind if the deployment is genuinely missing it

If Step 1 reports `serviceKey: false` on the server serving your browser, re-bind the POS service key for that environment and re-run the check. In that case no app-logic change is needed at all.

## Step 4 — Make the message actionable

Replace the flat "not configured" text with something staff can act on and that is clearly different from an authentication failure — for example: "Central database key missing on this server — an administrator needs to re-save it. Sales are being queued locally." Show it in the connection check as a warning distinct from "this till is not recognised".

## Technical notes

- Files touched: `src/routes/api/public/sync.ts`, `src/lib/pos-relay.server.ts`, new `src/routes/api/public/sync-health.ts`, `src/components/pos/ConnectionCheck.tsx`.
- No database migration, no schema change, no change to how writes are authorised.
- The health probe never returns key values, lengths or prefixes — only whether each name is set.