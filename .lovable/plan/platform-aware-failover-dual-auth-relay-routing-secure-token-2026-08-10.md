# Platform-aware failover, dual-auth relay routing, secure token storage

## 1. Operational writes go to a real database only

Today shifts, sales, drawer logs and stock adjustments can land in the browser
queue when the local desktop database is absent. That changes for these
operational tables only (catalog edits, settings and other admin writes keep
their current behaviour):

- Windows/Electron: the local SQL Server instance stays the primary target.
- If the local engine is missing or refuses the write: go straight to the
  central cloud database — directly with the signed-in Supabase session, or
  through the `/api/public/sync` relay for PIN users.
- If both fail, nothing is queued. The action halts and shows:
  "Database Connection Required: Unable to reach the local database server or
  online database. Please check your network connection."
- Android (live only) keeps its single target and gets its own wording on the
  shift screens: "Shift cannot be opened: Central server relay is offline.
  Please contact an administrator."

Non-operational writes continue to use the existing durable queue, so nothing
else in the app loses its offline behaviour.

## 2. Activation credentials live in the local database

On activation the token, the bound branch (`terminal_branch_id`) and the local
database connection details are written into the local SQL database
(`system_settings`, plus the existing terminal row). Browser local
configuration is used only when no local SQL engine is present on the device.
Existing encrypted device storage stays as the fallback path, unchanged.

## 3. Dual-auth routing for shift and sale writes

- Admins and supervisors signed in with email/password keep writing directly
  with their live session.
- Cashiers and staff signed in with a PIN have no session of their own, so all
  their shift and sale writes are routed through `/api/public/sync`, which
  commits with the server-side service key. Both the existing PIN login
  endpoint and the SHA-256 session-token verification are left untouched.

## 4. Terminal context and locked cashier name

- A cashier whose profile has no branch inherits the branch bound to the
  physical terminal at activation (already in place; the same rule is applied
  to the close-shift and handover paths).
- The cashier name field is read-only and disabled on every open-shift,
  close-shift and handover dialog, always showing the signed-in user's name.

## Technical notes

- `src/lib/pos-db.ts`: `commitOps` gains an operational-table classification
  (`sales`, `sale_items`, `shifts`, `shift_sessions`, `drawer_events`,
  `stock_adjustments`, `booking_payments`). For those, the browser branch skips
  `enqueue`/outbox entirely and does local SQL -> cloud/relay -> `AllTargetsFailed`.
- `src/lib/db-mode.ts` / `DbConnectionModal.tsx`: platform-aware copy, with the
  Android relay-offline wording driven by `isLiveOnly()`.
- New `src/lib/pos-auth-route.ts`: decides direct-session vs relay per write,
  used by `runOpLive`; PIN sessions always take `relayOp`.
- `electron/db/schema.sql` + `electron/db/repo.cjs` + `electron/preload.cjs`:
  add a `system_settings` key/value table and `getSetting`/`setSetting` IPC;
  `src/lib/terminal-tokens.ts` and `src/lib/local-db.ts` read/write activation
  token, `terminal_branch_id` and connection params there first, falling back to
  the sealed browser store.
- `src/routes/index.tsx`, `src/routes/shifts.tsx`,
  `src/components/pos/ShiftGuard.tsx`: close-shift/handover cashier inputs get
  the same `readOnly disabled` treatment as open-shift.
- `src/lib/__tests__`: cases for operational writes never queueing in the
  browser, PIN writes taking the relay, and the two failure messages.
- Version bumped to 1.2.56.
