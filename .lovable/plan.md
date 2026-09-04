# Connection diagnostic — findings, evidence, and the minimum fix

No files were changed. Everything below is backed by a read or a live request against the running app.

## 1. The connection map

```text
             ┌──────────────────────── the two addresses ────────────────────────┐
             │ A. Central database address + publishable key                     │
             │ B. POS backend web address (your own site)                        │
             └───────────────────────────────────────────────────────────────────┘

Screen (till / phone / browser)
  ├─ A → supabaseConfig()  [src/lib/external-supabase-config.ts]   ← single resolver
  │      device: sealed vault (Windows DPAPI / Android Keystore) via Settings
  │      web:    values printed into the page by the server (window.__POS_CONFIG__)
  │      → supabaseExternal (reads, sign-in, direct writes)
  │
  └─ B → serverUrl(path)   [src/lib/server-origin.ts]
         web:    "" (relative)      device: saved backend address, else nothing
         ├─ setup check   GET  /api/public/sync-health
         ├─ backup route  POST /api/v1/pos/sync      ← the write relay
         ├─ cashier login POST /api/public/cashier-login
         └─ staff list    POST /api/public/terminal-staff

Server (Cloudflare worker)
  /api/v1/pos/sync → pos-relay.server.ts → service key (POS_SUPABASE_SERVICE_ROLE_KEY)
                     + supabaseConfig().url → central database
```

Addresses are **not** interchangeable: the database address is a `*.supabase.co` project, the backend address is your POS website. There is no separate "API base", "backup", "health" or "relay" address — those are paths on the backend address.

## 2. Root cause of "Server backup route: failed to fetch" — evidence, not a guess

The relay path moved from `/api/public/sync` to `/api/v1/pos/sync` (`src/core/api/sync-relay.ts:81`). The old path carries cross-origin headers; **the new one does not**.

- `src/routes/api/public/sync.ts` — imports `corsPreflight`/`withCors`, has an `OPTIONS` handler.
- `src/routes/api/v1/pos/sync.ts` — no CORS import, no `OPTIONS` handler.
- Live check against the running server:
  `OPTIONS /api/v1/pos/sync` with `Origin: https://x.test` → `204` with **no `Access-Control-Allow-Origin`**.

A Windows till and an Android shell are always cross-origin to the hosted site, so the browser layer blocks the request before it is sent — which surfaces exactly as `Failed to fetch`. On the web app itself (same origin) the route works: `POST /api/v1/pos/sync` returned `400 {"ok":false,"error":"Nothing to do"}`, so the route exists, the server key is present, and nothing is wrong server-side.

Second, related exposure: `/api/v1/*` is outside the `/api/public/*` prefix, which is the prefix that stays reachable without site authentication on a published deployment. A device calling the published site can therefore be answered with a sign-in page instead of the relay.

So the answer to your A–J list is **E (CORS) plus a path/prefix problem**, not a missing route, missing variable, wrong credential or Supabase fault.

## 3. Root cause of "Server setup could not reach the setup check"

`syncHealth()` (`src/core/api/sync-relay.ts:24`) fetches `serverUrl("/api/public/sync-health")` and returns `null` on any non-OK response or any thrown error; the panel prints that one sentence for every cause. On a device with no backend address saved, `serverUrl()` returns the bare path, which hits the shell's own local file server and gets the app shell HTML back — `res.json()` throws, `null` is returned, and the message appears even though the real server is fine.

Verified on the running server: `GET /api/public/sync-health` → `200`
`{"serviceKey":true,"posUrl":true,"posUrlSource":"build","cloudflare":{"SUPABASE_URL":true,"SUPABASE_ANON_KEY":false,"SETTINGS_ENCRYPTION_KEY":true},"runtime":"dev"}`

Note `SUPABASE_ANON_KEY: false` — the key resolves under a different accepted name (`SUPABASE_PUBLISHABLE_KEY`). The app works, but that panel line reads as a missing variable. Cosmetic reporting bug, not a connection fault.

## 4. "E is not iterable" — NOT reproduced, so not diagnosed

I could not reach the health check headlessly: the app stays on the connecting/loading gate without a signed-in staff session, so the code never ran. I will not name a cause without the stack. The shortlist to check with the real trace: `SchemaHealthPanel.tsx:69/86/102`, `SchemaPanel.tsx:728`, `central-drift.ts:55`, `deep-drift.ts:75`, `db-health.ts:280/296` — all iterate a value that arrives from a server call. **Step 1 of the fix is to capture the stack in a dev (unminified) run, then fix the one that actually throws.**

## 5. Configuration variables — what is required

| Component | Value | Where it comes from | Present here | Correct |
| --- | --- | --- | --- | --- |
| Database | Project URL | Settings → Database & Cloud Connection (device) / hosting variable `SUPABASE_URL` (web) | Yes | Yes |
| Database | Publishable (anon) key | same; accepted names include `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_POS_SUPABASE_ANON_KEY` | Yes | Yes (reported as missing by the health panel — naming only) |
| Backend | POS backend address | Settings → Database & Cloud Connection (device only; web uses relative) | Device-dependent | Must be the site root, `https://`, no `/api` |
| Relay / backup | `POS_SUPABASE_SERVICE_ROLE_KEY` | hosting secret, server-only | Yes (`serviceKey: true`) | Yes |
| Settings encryption | `SETTINGS_ENCRYPTION_KEY` | hosting secret, server-only | Yes | Yes |
| Health check | none | — | — | — |
| Sync | none beyond the above | — | — | — |

**No additional user-configured variables are required.** Everything a shop owner must enter is the database URL, the publishable key and the backend address — all on one screen already.

## 6. Security

Clean. The service key is only read in `pos-relay.server.ts` and never returned; `/api/public/sync-health` reports booleans only, no values, lengths or prefixes; the publishable key (safe in the browser) is the only credential printed into the page. No database password, backup credential or server secret is reachable from client code.

## 7. Minimum safe fix (for approval — nothing done yet)

1. Capture the real "E is not iterable" stack in a dev run, then fix that single call site so a failed server response is handled as an error, not iterated. No blanket try/catch.
2. Give `/api/v1/pos/sync` the same cross-origin treatment the old path has: `OPTIONS` handler plus `withCors` on every response, including errors.
3. Make the relay reachable from devices on a published site — keep the canonical path but ensure it answers under the publicly reachable prefix (alias `/api/public/sync` to the same handler rather than duplicating logic).
4. Replace the two catch-all messages with the real reason: "no backend address saved on this device", "the address answered with a web page, not the POS backend", "blocked by the browser (cross-origin)", "server refused (401)".
5. Fix the health panel's key-presence line to accept the same key names the resolver accepts.
6. Verify: typecheck, full test run, a cross-origin preflight against the relay, and a device-style call with an explicit backend address.

No change to RLS, schema, authentication, sync logic, permissions or Emergency Access.
