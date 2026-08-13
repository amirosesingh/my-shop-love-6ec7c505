# Fix the desktop update check and terminal activation

Two separate faults, both confirmed in the code.

## 1. Update check blocked by CORS on Windows

The till's window is served from `http://127.0.0.1:43117`, so a browser
request to `updatecms.luckycharmsdnbhd.com` is cross-origin and the bucket
sends no `Access-Control-Allow-Origin` header — the browser cancels the
request even though the server answered 200.

`src/lib/native-http.ts` already routes around this on Android (Capacitor's
native HTTP), but on Windows it falls through to plain `fetch`. Fix: give the
desktop shell the same escape hatch.

- New `electron/net.cjs`: main-process HTTP helpers (`getJson`, `head`,
  `getBase64`) built on Electron's own `net` module, which is not subject to
  CORS.
- `electron/main.cjs` registers `net:get-json`, `net:head`, `net:get-binary`;
  `electron/preload.cjs` exposes them on the existing bridge object.
- `src/lib/native-http.ts`: when running inside the desktop shell, use that
  bridge in `httpGetJson`, `httpExists` and `httpGetBase64`, keeping the
  current `fetch` path as fallback for the browser and for an older shell that
  has no bridge yet.

No change to what is fetched, only how — the manifest URL, fallbacks and
timeout behaviour stay exactly as they are.

## 2. "Stores cannot be synced" when activating a terminal

Issuing an activation code first mirrors the branch list up
(`ensureLocations` in `src/lib/terminal-tokens.ts`) through the write relay.
The relay's allow-list does not contain `stores`, so `relay-policy.server.ts`
answers `TABLE_FORBIDDEN` — `"stores" cannot be synced` — and token creation
stops. The same block also breaks saving a location on the Locations screen.

Fix: admit `stores` to the relay as a settings-level table, with rules:

- Added to `RELAY_TABLES` in `src/lib/pos-relay.server.ts` and to the writable
  set in `relay-policy.server.ts`.
- Branch column is the row's own `id`: a supervisor/admin may insert or update
  any branch; a non-supervisor may only touch the row matching their own
  verified `store_id`, and may not create new ones.
- Deleting a branch requires the same admin gate.

That keeps branch isolation intact — a cashier's till still cannot invent or
rename another branch — while the admin screen that issues terminal tokens
works again.

## Technical notes

- Files: `electron/net.cjs` (new), `electron/main.cjs`, `electron/preload.cjs`,
  `src/lib/native-http.ts`, `src/lib/pos-relay.server.ts`,
  `src/lib/relay-policy.server.ts`.
- No database migration and no schema change is needed; `stores` already
  exists and its RLS is unchanged (relay writes use the service path, gated by
  the rules above).
- Version bump with the change so the desktop build carries the CORS fix.
