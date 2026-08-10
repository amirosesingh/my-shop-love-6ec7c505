# Unified database router, two-way sync, and locked cashier shift binding

## What this delivers

1. One way in and out of data for the whole app, with automatic fallback: this terminal first, the online database second, and a clear "can't save" popup if neither answers.
2. Background catch-up both ways: pending till activity pushed up in order, master data (products, prices, suppliers, branches/terminals) pulled down so the register works the same offline.
3. No success message anywhere until the data is genuinely stored.
4. The cashier name on "Open shift" is taken from the signed-in user and cannot be typed over; the branch comes from the terminal, not the staff record.

## Current state (verified)

- `commitOps` in `src/lib/pos-db.ts` is already the durable write gate with three branches (live cloud, Windows local SQL Server, browser outbox) and already consults the Local/Online mode switch added earlier. What it lacks is a named public identity, a cloud attempt after a *local* failure, and a hard stop when both targets fail.
- Reads are not routed at all: `loadCloudState()` runs once at start-up and writes a snapshot (`src/lib/offline-snapshot.ts`); there is no periodic pull, so price and catalogue changes made elsewhere do not reach an offline till.
- The push worker (`src/lib/sync-engine.ts`) already drains the outbox in journal order, marks entries, relays refused writes through the server, and updates the failover state.
- Write-then-notify is done in `ShiftGuard.tsx` but **not** in `src/routes/index.tsx` (line ~2778) or `src/routes/shifts.tsx` (line ~242) — both call `openShift(...)` without awaiting it.
- The cashier field in all three open-shift forms is a free-text input pre-filled with the signed-in name; it can be edited.
- Terminal-to-branch binding already exists in `src/lib/active-branch.ts` (`terminal_branch_id`).

## Step 1 — `dbRouter`: one named entry point

A new `src/lib/db-router.ts` wraps the existing gate rather than replacing it, so nothing already working is disturbed.

- `dbRouter.write(context, ops)` runs in tiers:
  - **Primary** — this terminal (local SQL Server on Windows, on-disk queue in the browser), record flagged pending.
  - **Secondary** — if the local target is unavailable, uninitialised, or errors (including storage full), silently write straight to the online database and raise a "Cloud direct mode" indicator in the status pill.
  - **Tertiary** — both refused: nothing is half-written, the action stops, and a modal appears: "Database Connection Required…".
- Online-only mode keeps today's order (cloud first, local as failover).
- `dbRouter.read(...)` serves from the local snapshot/database and falls back to the cloud.
- A refusal for *rule* reasons (permission, duplicate, constraint) is never treated as a failover — it is reported as-is.

## Step 2 — Two-way sync

- **Push**: existing outbox worker, unchanged behaviour, plus explicit status transition to synced on confirmation and a reconnect trigger.
- **Pull** (new, in `src/lib/sync-engine.ts`): a periodic and on-reconnect refresh of master data — products/prices, suppliers and their invoices, stores, terminals and settings — upserted into the local snapshot/database so register search and barcode scanning see cloud changes immediately, offline included. Till-generated records are never overwritten by a pull.
- Android stays live-only and skips both.

## Step 3 — Write-then-notify sweep

- Convert the un-awaited `openShift` calls in `src/routes/index.tsx` and `src/routes/shifts.tsx` to the awaited pattern already used in `ShiftGuard.tsx`, with the toast reporting where it landed.
- Sweep the remaining write buttons — close shift, complete sale, cash flow / drawer, stock receive and adjust, transfers, bookings, holds — confirming each awaits `dbRouter` before it toasts, clears a cart, or closes a dialog. On failure the UI state reverts and the error modal shows.

## Step 4 — Locked cashier binding

- The signed-in display name is the single source for the cashier field on all three open-shift surfaces; the input becomes read-only and disabled, shown as a plain locked field.
- Shift open uses the terminal's branch when the staff record has none, so a cashier with no branch on their account can still open a shift on a bound terminal.
- The existing read-back check after commit stays, so the terminal only unlocks once the shift row is confirmed.

## Step 5 — Project-wide scan

- Sweep `src/`, `electron/` and the Android shell for direct database calls that skip the gate and route them through `dbRouter`.
- Tests: tier selection and fallback order, both-fail modal path, chronological push, pull upsert not clobbering pending rows, and the locked cashier field.

## Preservation

Untouched: session token hashing and `/api/cashier-login`, register layouts, product deletion guards and archive modal, barcode scanning, terminal branch binding.

## Technical notes

- `src/lib/db-router.ts` (new) is a thin facade over `commitOps`/`db-mode`; `commitOps` gains a cloud-fallback branch when the local bridge write fails, and throws a typed `AllTargetsFailed` error the modal listens for.
- Pull sync reuses `loadCloudState()` slices and `writeSnapshot`, on an interval plus the `online` event.
- Version bump to 1.2.48.