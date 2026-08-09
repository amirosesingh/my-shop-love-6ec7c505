# Fix hydration warning and realtime websocket warning

Two small, isolated fixes. No behaviour or business logic changes.

## 1. Hydration mismatch on the page shell

The theme boot script sets `class="dark"`, `color-scheme` and accent CSS variables on `<html>` before React hydrates, so the client markup no longer matches what the server sent. React logs this as a hydration mismatch.

Fix: mark the shell elements in `src/routes/__root.tsx` as intentionally different between server and client by adding `suppressHydrationWarning` to `<html>` (and `<body>`, since the same inline script touches document-level attributes). The theme boot script stays exactly as it is, so there is still no flash of the wrong palette.

## 2. "WebSocket is closed before the connection is established"

The realtime health probe in `src/lib/system-health.ts` opens a brand new channel with a random name on every poll, and on timeout it calls `removeChannel` while the socket is still mid-handshake. That is exactly the condition that produces the warning, and the status pill re-runs the probe every two minutes, so it repeats.

Fix, all inside `checkRealtime`:
- Reuse one long-lived probe channel per page instead of creating a fresh `health-<uuid>` channel each poll. If it is already subscribed, report healthy immediately without touching the socket.
- Guard against the status callback firing twice so a late status change cannot resolve or close a second time.
- On the timeout path, do not tear the channel down while it is still connecting — report the degraded status and let the handshake settle on its own.
- Export a `disposeRealtimeProbe()` helper and call it from the unmount cleanup of `SystemStatusPill` and the system settings page, so the channel is removed exactly once, when the surface goes away.

The Supabase client itself is already a lazily created singleton (`src/integrations/supabase/client.ts` and the external client), so nothing changes there.

## Files touched

- `src/routes/__root.tsx`
- `src/lib/system-health.ts`
- `src/components/pos/SystemStatusPill.tsx`
- `src/routes/settings.system.tsx`