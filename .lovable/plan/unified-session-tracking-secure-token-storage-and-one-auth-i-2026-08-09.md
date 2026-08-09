# Unified session tracking, secure token storage and one auth interceptor

## 1. One place that holds the till's credentials

Today the cashier session token lives only in `sessionStorage`, and the reader sends it
under the wrong name (`terminalToken` instead of `cashierToken`) — which is why saves fail
with "This till could not prove who it is". Fix:

- A single credential store used by every caller (server functions, the sync relay,
  background sync): cashier session token, terminal activation token, staff access token.
- Storage per platform:
  - Web: encrypted browser storage (the existing device-secret helper), not `sessionStorage`,
    so a reload or update does not lose or keep a stale sign-in.
  - Electron: the existing `safeStorage`-backed terminal store.
  - Android: the existing native secure store.
- The reader always labels each credential correctly, so the server can verify it.

Note on HttpOnly cookies: the till talks to the central database directly from the client,
so the access token must be readable by the app to sign those calls. Tokens will be kept in
platform-encrypted storage rather than cookies; the same protection applies without breaking
direct database access.

## 2. Boot and resume verification

- New `verify-session` server call: given whatever credentials the device holds, it answers
  active / revoked / unknown, plus the branch the caller belongs to.
- It runs before the dashboard renders and before branch data loads, on app launch, on
  resume from background, and before privileged saves.
- Checks both: the token is still active (cashier session valid, terminal token not revoked,
  staff account live) AND the linked branch still exists.
- Failure (401/403/404, revoked token, deleted branch) purges all stored session data and
  redirects to Sign In with: "Your session or branch is no longer active. Please sign in again."

## 3. Backend checks on every request

- `/api/public/sync` and the other privileged handlers run the same verification helper:
  token active + branch exists. An unproven or branch-less caller is refused with 401 and a
  clear reason code, never a blank error.
- Deleting a branch, or "Remote Reset" on a terminal, marks that terminal's token revoked and
  ends its open staff sessions, so the remote till drops out on its next call.
- The sync engine attaches `Authorization: Bearer <access_token>` on every request that has a
  staff session, in addition to the credential body.

## 4. One global interceptor

- The existing session-expiry inspector becomes the only decision point, wired into the
  central-database client, all server-function calls and the sync/relay fetches.
- Genuine token rejection (401, or a 403/404 naming a dead token or missing branch) clears
  stored tokens and returns to Sign In with the message above.
- Timeouts, offline moments and 5xx keep the till working and only raise the temporary
  connectivity alert. Sync failures never crash a screen; they queue and retry.

## 5. Unified staff matrix and admin bypass

- Cashier, Warehouse Supervisor, Supervisor/Manager and Admin are all rows in the one staff
  table — no separate account types.
- The permission matrix shows an individual toggle for every capability, grouped by area
  (register, inventory, staff, reports, settings).
- Admin: every toggle on and read-only (an admin cannot be reduced below full authority), and
  every Manager PIN prompt is bypassed automatically on web, Windows and Android — the action
  is still written to the override log as auto-approved.
- Supervisor and Cashier: act on their own toggles; protected actions with "Require Manager
  PIN" ON show the authorisation modal, validated server-side against manager/admin accounts.

## Technical notes

- New `src/lib/pos-credentials.ts` (platform-aware read/write/clear) replacing the
  `sessionStorage` reads in `src/lib/pos-caller-auth.ts`, `src/lib/sync-relay.ts` and
  `src/lib/pos-auth.tsx`.
- New `src/lib/session-verify.functions.ts` + `.server.ts` for `verify-session`; called from
  a boot gate in `src/lib/pos-auth.tsx` and before privileged mutations.
- `src/lib/pos-relay.server.ts`: `verifyRelayCaller` also confirms the caller's branch still
  exists and the terminal token is not revoked; `src/routes/api/public/sync.ts` returns the
  reason code.
- `src/lib/session-expiry.middleware.ts` extended to cover 404-branch-missing, and the relay
  fetches routed through `inspectResponse`.
- New `supabase/schema28.sql`: `SECURITY DEFINER` + `GRANT EXECUTE ... TO authenticated` on
  `is_staff`, `is_staff_now`, `is_supervisor_now`, `is_app_supervisor`, `has_role`, `has_perm`;
  a `terminal_sessions_revoke_for_branch(branch_id)` routine used by branch delete and Remote
  Reset. Grants and additions only — nothing dropped, no seeding.
- `src/routes/staff.tsx` / `src/lib/pos-permissions.tsx`: full toggle matrix, admin locked to
  all-on; `src/lib/manager-gate.tsx` keeps the admin bypass consistent across platforms.
