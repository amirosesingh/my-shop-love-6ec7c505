# Database mode toggle, write-then-notify, and cashier shift verification

## What this delivers

1. A visible switch that decides where this till reads and writes: **Online only** or **Local first**, with automatic failover to local when the internet drops and automatic catch-up sync when it returns.
2. A guarantee that no success message ever appears before the data is actually stored.
3. A cashier "Open shift" path that is confirmed present in the database before the till unlocks.

## Current state (verified)

- Writes already go through one durable gate (`commitOps`): Windows desktop writes to the local SQL Server bridge, the browser queues to the on-disk outbox first, Android writes live to the cloud. The plumbing exists; there is no user-facing mode switch and no failover rule.
- Sync & Backup has an "Online sync" toggle only — it pauses pushing, it does not choose a read/write source.
- Open shift already awaits the commit before unlocking, but the shift dialog shows a fixed "Shift opened" toast rather than reporting where it landed, and there is no read-back confirmation.
- The shift table in the central database is `shifts` (not `cash_shifts`). Its insert/update rules require a signed-in staff identity plus branch visibility. Cashiers sign in by PIN, not by a central-database account, so their direct writes are refused and must travel through the server relay. That relay path exists; this plan makes it explicit and verified rather than incidental.

## Step 1 — Database mode switch

- New per-device setting `databaseMode`: `online` | `local`, defaulting to today's behaviour (local-first on web/desktop, online on Android).
- Shown in two places: Settings → Sync & Backup, and a compact indicator in the header pill beside the existing sync status.
- `online`: writes attempt the cloud immediately and only fall back if that fails.
- `local`: writes land in the local store/queue first and are pushed in the background.
- **Failover**: in `online` mode, loss of connectivity (browser offline event, or a network-class push failure) flips an *effective* mode to local without changing the user's chosen setting; the pill reads "Online (failover: local)". On reconnect the effective mode returns to online and a drain runs.
- Android stays live-only; the switch is shown as fixed with a short explanation.

## Step 2 — Automatic sync on reconnect

- Reuse the existing outbox drain, extended with: a reconnect trigger, strict chronological ordering by the existing per-terminal sequence, and marking each entry `synced` on confirmation (the status field already exists).
- Sales, shift events, inventory adjustments and drawer/cash entries already flow through the outbox; each is verified and any that bypass it are corrected.

## Step 3 — Write-then-notify audit

- Make the existing `useCommit` helper the only sanctioned way a write button shows a toast — it already awaits the commit and reports where the data landed.
- Audit every write button and convert any that toasts optimistically. Targets to check: open/close shift, complete sale, drawer open, cash-flow logging, stock adjust, receiving invoice finalise and edit, transfers, members, bookings, holds, promotions, product save/archive.
- On failure: an error popup with the plain-language reason and no UI progression — cart not cleared, dialog stays open, shift stays locked.

## Step 4 — Cashier shift verification

- After the shift commit, read the shift back from whichever store accepted it (cloud, local database, or queue) and only then unlock and toast.
- Toast text reflects reality: "Shift opened", "Shift opened — saved on this terminal", or "Shift opened — saved offline, will sync".
- If the central database refuses a cashier insert, route it through the server relay (already available) and record the refusal in the sync log so it is visible in Sync & Backup instead of failing silently.
- No database policy changes are proposed yet. If the read-back shows cashier inserts are refused even through the relay, that becomes a separate migration put up for review.

## Step 5 — Project-wide scan

- Search `src/`, `electron/`, and the Capacitor shell for direct database writes and raw bridge calls that skip the commit gate, and route them through it.
- Add tests: mode selection and failover, chronological drain, and shift-open read-back.

## Preservation

Untouched: product deletion protection and the archive modal, the cashier-login endpoint and session token hashing, POS layouts, terminal branch binding, and barcode scanning.

## Technical notes

- New `src/lib/db-mode.ts` holds the stored preference, the effective mode, and a subscription so the header and settings stay in step.
- `commitOps` in `src/lib/pos-db.ts` gains mode awareness at its top; the three existing branches (live, local bridge, outbox) stay as they are.
- Version bump to 1.2.48.