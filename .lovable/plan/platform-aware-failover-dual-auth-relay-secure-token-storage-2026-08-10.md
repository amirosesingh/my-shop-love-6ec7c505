# Platform-aware failover, dual-auth relay, secure token storage

## What changes

### 1. Operational writes go to a real database, never the browser queue
Business writes (shifts, sales, drawer logs, stock adjustments, transfers) are classified as
"operational". For those the write gate becomes:

```text
Windows/Electron : Local SQL Server  ->  Cloud (JWT or relay)  ->  HALT + modal
Browser (no SQL) : Cloud (JWT or relay)                        ->  HALT + modal
Android          : Cloud relay only                            ->  HALT + block message
```

The browser outbox is no longer used for these records — nothing operational is parked in
localStorage. Non-operational writes (catalog edits, settings, drafts, held orders) keep their
current behaviour so nothing else regresses.

Trade-off worth naming: a web till with no local SQL engine and no internet can no longer take a
sale offline; it halts with the connection message instead of queuing.

Messages:
- Browser/Electron: "Database Connection Required: Unable to reach the local database server or
  online database. Please check your network connection."
- Android: "Shift cannot be opened: Central server relay is offline. Please contact an
  administrator."

### 2. Activation credentials stored in the local SQL database first
When a terminal activates, the activation token, `terminal_branch_id` and the database connection
parameters are written into the local SQL engine (a `system_settings` table plus the terminal
row). The encrypted device store is used only when no local SQL engine is present. On start-up the
local database is read first, then the device store.

### 3. Dual-auth routing (existing auth untouched)
- Admins/supervisors signed in with email + password keep writing directly with their Supabase
  session token.
- PIN cashiers hold no session token, so their shift and sale writes route through
  `/api/public/sync`, which commits with the service key held on the server.

The router picks the path from the active session kind. SHA-256 session hashing and the cashier
PIN login endpoints are not touched.

### 4. Terminal branch primacy and locked cashier name
- A cashier with no branch on their profile inherits the branch bound to the device at activation.
- Cashier Name on Open Shift, Close Shift and Handover is filled from the signed-in user and is
  read-only and disabled everywhere.

### 5. Version
Bump to 1.2.56.

## Technical notes

- `src/lib/sync-outbox.ts`: add an operational-table list; `enqueue` refuses those tables.
- `src/lib/pos-db.ts` (`commitOps`): new operational path — Electron bridge, then
  `runOpLive`/relay, then `AllTargetsFailed`; no queue step. Android stays live-only and throws the
  relay-offline message.
- `src/lib/db-router.ts`: `write(context, ops, { operational: true })` passthrough.
- `src/lib/sync-relay.ts` + `src/routes/api/public/sync.ts`: relay chosen when the session is a PIN
  cashier; the service key is already read server-side from `POS_SUPABASE_SERVICE_ROLE_KEY`.
- `electron/db/schema.sql`, `electron/db/repo.cjs`, `electron/terminal-store.cjs`: add
  `dbo.system_settings` and `dbo.terminals`; expose read/write over the existing preload bridge.
- `src/lib/terminal-tokens.ts`: persist/read activation through the local SQL bridge when present,
  falling back to `device-secrets`.
- `src/lib/active-branch.ts`: terminal branch wins when the cashier profile branch is null.
- `src/components/pos/DbConnectionModal.tsx` and `src/lib/notify.ts`: platform-specific wording.
- Cashier field lock audit across `src/routes/index.tsx`, `src/routes/shifts.tsx`,
  `src/components/pos/ShiftGuard.tsx` and the handover modal.
- Tests extended in `src/lib/__tests__/db-router.test.ts` for the three failure modes.
- `src/version.ts` -> 1.2.56.

No register layout, barcode, or product-deletion-guard changes.