# Make "Backend address" work with your own domain

## What the field actually wants

The Backend address is the public address of **this POS web app** — the custom
domain you deployed to Cloudflare (for example `https://pos.yourcompany.com`).
It is never the database project address. Sign-in and sync still authenticate
against the cloud database, but the till talks to your web app, and the web app
talks to the database with the key it holds server-side. That is why entering
the database address returns **401** — you are talking to the database directly
without a key, which is exactly what the design avoids.

## Why your own domain also failed

Two confirmed faults in the app, not in your hosting:

1. **The test button calls the wrong endpoint.** "Test connection" sends a GET
   to `/api/public/health-metadata`, but that route only accepts POST and
   requires a signed-in caller. So a perfectly good server answers with a
   rejection, and the panel reports "no answer".
2. **No cross-origin permission.** A Windows till or Android app is not served
   from your domain, so its request is cross-origin. None of the public
   endpoints send `Access-Control-Allow-Origin`, so the browser layer inside the
   app cancels the request before any answer arrives — reported as "unable to
   get a response".

## The fix

1. Point the test at the open health endpoint (`/api/public/sync-health`, GET,
   no credentials) and read its answer instead of guessing.
2. Add cross-origin headers plus an `OPTIONS` responder to the public endpoints
   the tills call: sync-health, health-metadata, cashier-login, sync,
   terminal-staff, emergency-escrow. Only these; nothing else opens up.
3. Make the test result say what actually happened, in plain words:
   - answered and holds the database key → ready to use
   - answered but the key is missing on the server → server setup task, tells
     you which variables to set in Cloudflare
   - answered with the database's own error shape → "this is a database
     address, enter your POS website address instead"
   - HTML page instead of an answer → "this address serves a website but not
     this POS backend"
   - no answer at all → network/DNS/TLS, with the underlying reason shown
4. Rewrite the panel's help text so the expected value and an example are
   visible in the field itself, and normalise what is typed (add `https://`,
   strip trailing slashes and any accidental `/api/...` suffix).

## Multiple tills

Every till points at the same address. They are told apart by their activation
token and branch binding, not by the address, so adding a PC needs no change
here.

## Technical notes

- Files: `src/lib/backend-config.ts` (probe + diagnosis + normalisation),
  `src/platforms/web/components/pos/settings/panels/BackendAddressPanel.tsx`
  (guidance and result display), a small shared CORS helper used by the public
  route files listed above.
- No change to authentication, relay verification, RLS, key handling or the
  service-role boundary; the cross-origin headers apply to endpoints that
  already verify their caller inside the handler.
- Version bump via `node scripts/bump-version.cjs`.
