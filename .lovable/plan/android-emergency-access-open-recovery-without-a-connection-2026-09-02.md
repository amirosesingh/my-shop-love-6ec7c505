# Android Emergency Access — open Recovery without a connection

## What's actually wrong

Confirmed by reading the code:

1. **The connection gate wraps every screen, including Recovery.** In `src/routes/__root.tsx`, `<OfflineGate>` sits above `<Outlet />` with no route exemption. `OfflineGate` is active whenever `isOnlineOnly()` is true — that is true on Android and Web (only the Windows till is exempt). So even after navigating to `/recovery`, the gate renders "Connecting…" / "No connection" instead of the page.
2. **The Emergency Access link is a hard page load.** `src/components/mobile/OfflineGate.tsx` uses `<a href="/recovery">` rather than router navigation. Inside the Android shell this restarts the whole app: `NativeBoot` splash → backend address hydrate → web-bundle check → `OfflineGate` again. That is the "it starts looking for online" behaviour you see.
3. `NativeBoot` also runs its start-up work before anything renders, so even a correct navigation is preceded by a start-up pass that assumes a reachable backend.

The PIN gate, the recovery panels and the Android Keystore secret are all already implemented and correct — the page simply never gets a chance to render.

## The fix

1. **Exempt Recovery from the connection gate.** `OfflineGate` reads the current router location; when the path is `/recovery` it renders its children immediately, on every platform. Same treatment for the start-up splash: `NativeBoot` skips its hydrate/update pass (or renders children immediately after the backend-address read) when the app opens on `/recovery`, so a dead backend can never stall the repair screen.
2. **Navigate with the router, not a full page load.** Replace the `<a href="/recovery">` in `OfflineGate` with a TanStack `<Link to="/recovery">`, matching what `CloudSetupGate` already does. No app restart, no re-boot pass.
3. **Deep-link safety.** If Android cold-starts directly on `/recovery` (from the update banner, a shortcut, or a reload), the two changes above keep it rendering the PIN gate offline.
4. **Keep the PIN gate first.** Order stays Emergency Access → PIN gate → Recovery settings. Nothing about PIN derivation, drift tolerance or lockout changes.
5. **Guard against regressions.** Add a test asserting that `/recovery` renders through the connection gate while connectivity is "offline", so a future change cannot re-gate it.

Web and Electron behaviour is unchanged apart from Recovery no longer being blocked by the gate.

## Features already built but not reachable in the UI

From comparing the route files against the navigation registry (`src/components/pos/nav-config.ts`):

- **Stock request workspace** — `/requests/new` and `/requests/$id` exist, but there is no `/requests` index route and no navigation entry. Requests can only be reached by typing the URL or from inside a transfer.
- **Goods receiving workspace** — `/receiving/$id` exists with the blind-count flow, but there is no receiving list route and no menu item; it is only reachable from a purchase order link.
- **Emergency access / Recovery** — `/recovery` is intentionally unlisted, and today (per the bug above) effectively unreachable on Android.
- **Customer display** — `/display` is in the registry but only useful when opened on a second screen; there is no in-app launcher on Android.
- **Restore drill / rebuild check** — implemented in the sync hub, Electron-only in practice; invisible on Android and Web.
- **Deep schema health & migration generator** — Electron-only introspection; the panel appears on other platforms with central-side findings only.

If you want any of those surfaced (a `/requests` list, a receiving list, a menu group for movements), say which and I will fold it into this plan or a follow-up.

## Technical notes

- Files touched: `src/routes/__root.tsx` (gate ordering / exemption wiring), `src/components/mobile/OfflineGate.tsx` (route exemption + `Link`), `src/components/pos/NativeBoot.tsx` (skip start-up pass on the recovery path), plus one new test.
- No schema, sync, PIN or business-logic changes.
- Version bumped via `node scripts/bump-version.cjs`.
