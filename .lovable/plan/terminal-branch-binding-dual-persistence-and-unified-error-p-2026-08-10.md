# Terminal branch binding, dual persistence, and unified error popups

## Feature 1 (top priority): terminal branch binding and shift unblocking

Most of this landed in the previous change: the shared resolver already prefers the terminal's registered branch, falls back to the branch in view, the locally mirrored branch, and finally the only branch that exists; cashier PIN sign-in binds that branch before the register mounts.

Remaining work:

- Persist the terminal's branch under an explicit `terminal_branch_id` key at start-up (from the activation claim, refreshed from the terminal record when the network allows), and read it from that one key everywhere instead of re-deriving it per call.
- Bind on every sign-in path, not just cashier PIN: admin/email login and staff sign-in also set the operational branch to the terminal branch on that device.
- Shift-open guard: allow opening a shift whenever the terminal branch exists, regardless of a null branch on the staff profile, and keep "Shift open" showing immediately after creation (already trusted locally for two minutes — extend that to survive a failed re-read rather than expiring).
- Keep the register unlocked while a shift is `OPEN`: cart, scanning, discounts, tenders and cash-in/cash-out stay live.
- Switching users (cashier A to cashier B) and recording cash flow must never close, lock or reset the open shift — verify the sign-out path leaves the shift untouched and add a regression test for it.

## Feature 2: dual online/offline persistence

The offline outbox and background sync engine already exist (`pos.sync.outbox`, chronological replay, quarantine after repeated failures, `online`/`offline` listeners). Work here is to close the gaps:

- Guarantee every transactional event writes locally first: sales, shift open/close, cash-flow (paid-in/paid-out) logs and inventory adjustments all go through the same commit gate before any network call.
- Make each queued entry carry a local UUID, a device timestamp and an explicit `pending` / `synced` / `failed` status, and surface those states in the Sync and Backup screen.
- On reconnect, flush in strict per-terminal chronological order and mark entries synced only on backend confirmation.

## Feature 3: error handling and notification popups

- One notification helper wraps every database, network and RPC failure so nothing fails silently.
- Raw Postgres errors are translated into plain sentences: foreign-key blocks say which record is in the way, access-rule refusals say the account is not allowed, connection failures say the till is offline and the action was queued.
- All call sites that currently swallow an error or leave the UI half-updated route through the helper.

## Preservation

No changes to purchase orders, receiving orders, product-deletion guards, session token hashing, or the edge endpoints.

## Technical notes

- `src/lib/active-branch.ts`: add `terminal_branch_id` persistence plus `bindTerminalBranch()`; keep the existing resolution order.
- `src/lib/pos-auth.tsx`: call the binder on all login paths (email, staff, cashier PIN, cached offline PIN).
- `src/lib/pos-store.tsx`: `openShift` uses the bound branch; `refreshActiveShift` never downgrades an open shift on a failed read.
- `src/lib/sync-outbox.ts` / `src/lib/sync-engine.ts`: add explicit status field and expose it; keep the existing queue key and replay ordering.
- New `src/lib/notify.ts` wrapping sonner with error formatting; used by db/rpc call sites.
- No database migrations, RLS changes or layout rewrites.
