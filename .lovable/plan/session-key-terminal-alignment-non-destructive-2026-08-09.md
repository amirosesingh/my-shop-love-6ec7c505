# Session, Key & Terminal Alignment (non-destructive)

## What the audit found

Confirmed by reading the code this turn:

- Sessions already exist end-to-end: `user_sessions` is created in `supabase/schema29.sql` (SHA-256 `session_token_hash`, `idle_timeout_minutes`, `is_revoked`, `last_activity_at`), minted by `startSession`, validated and touched by `touchSession`, revoked by `revokeSession` / `revokeSessionsFor`.
- Admin/supervisor login (`signInWithPassword`) and cashier PIN login both already call `startDeviceSession` after proving themselves, and sign-out already calls `endDeviceSession`.
- The raw token is stored in the device secure vault and sent as `Authorization: Bearer <token>` by `authHeaders()`.
- 401/403 responses are already intercepted centrally and end the session.

Real gaps (each verified, not assumed):

1. **The server ignores the Authorization header.** `/api/public/sync` and the settings API routes read the token only from the JSON body. A caller that sends the header but not the body field is treated as unproven.
2. **No `/api/cashier-login` endpoint.** Cashier PIN sign-in goes through a server function that calls `verify_cashier_pin` with the publishable key, not a service-key endpoint.
3. **`terminal_token_claim` takes only `p_token_id` and `p_device`.** Passing `p_proof_hash` / `p_platform` / `p_os` today would fail with a "function not found" error.
4. **No Active Sessions admin panel.** `user-sessions.functions.ts` already has list/revoke server functions, but nothing in Settings uses them.
5. Idle timeout is resolvable per user, per branch and globally in the backend, but only the global/branch value has a UI (Settings > Rules).

Service-key scan: `SUPABASE_SERVICE_ROLE_KEY` appears only in server-only files (`client.server.ts`, `pos-relay.server.ts`), and a test already asserts no client file references it. No change needed; the plan keeps it that way.

## What will be built, in order

**Task 1 — Login & session initiation**
- Add `/api/cashier-login` (server route) that verifies `{ username, pin }` with the service key and mints a `user_sessions` row directly, returning the raw token. Keep the existing server-function path as a fallback so no till breaks.
- Leave the admin/supervisor path as-is; it already mints a session with the resolved idle limit.

**Task 2 — Per-request validation & idle timeout**
- Teach the server to read `Authorization: Bearer <raw token>` first and fall back to the body field, in `/api/public/sync` and the settings API routes. Header-only and body-only callers both keep working.
- Keep the existing hash → exists → not revoked → within idle limit → touch `last_activity_at` sequence unchanged.
- Keep 5xx and network timeouts as a temporary connectivity notice; only 401/403 end the session.

**Task 3 — Terminal claim alignment**
- New migration extending `terminal_token_claim` with optional `p_proof_hash`, `p_platform`, `p_os` (defaulted, so existing two-argument callers keep working), stored on the token row for troubleshooting.
- Update the Electron/mobile claim calls to pass the explicit keys.

**Task 4 — Instant revocation & admin panel**
- New Settings > Active sessions page: live list of terminal/staff sessions with last activity, plus a per-row "Revoke / remote reset" button, admin-only.
- Re-assert the branch-delete and terminal-reset cascades into `user_sessions` so affected devices drop on their next call.

## Preserved untouched

Product deletion protection and archive modals, POS terminal layout and workflows, offline queue and local-storage fallback, and existing key handling.

## Technical notes

- One new SQL file (`supabase/schema31.sql`), additive only — no table or data drops.
- Header parsing added in a shared helper so both API routes behave identically.
- New page: `src/routes/settings.sessions.tsx`, reusing the existing list/revoke server functions.