# Terminal lock flash, cashier lock-out, and missing branch ids

## 1. Cashier is fully locked even though a shift is open

Confirmed in the code: the lock keys off `currentStore.id`, but nothing pins the current store to the terminal's registered branch. On boot, the store state falls back to `stores[0]` when the saved id is not in the loaded list, while the shift was opened against the terminal's branch. The lookup `shifts where store_id = <wrong branch> and status = 'OPEN'` then returns nothing, so the guard freezes the whole shell — exactly the Electron symptom.

Fix: the terminal's registered branch becomes the single source of truth.

- When a terminal is registered, the current branch is forced to the terminal's branch on sign-in and whenever the store list loads, before any shift read runs.
- The store fallback stops silently choosing the first store on a bound terminal.
- Opening a shift keeps its existing branch rule, so open and read now always agree.

## 2. "Terminal locked" flashes first, then clears

Also confirmed: while the first database read is in flight, the "already checked" flag is false and the local shift list is still empty, so the guard computes "no shift" and paints the lock screen for a moment before the answer arrives.

Fix: an explicit *checking* state.

- The store exposes whether the first shift read has settled.
- `ShiftGuard` shows a neutral "Checking shift…" strip (app visible, no lock panel) until then. The lock panel only appears once the database has actually answered "no open shift".
- Same treatment after resume and branch change, so the app never flickers to locked.

## 3. Empty branch / store ids on records

Every write already accepts a branch id, but callers pass whatever the app has in view — the same value that drifts in point 1. So blanks come from two places: rows written before the terminal binding existed, and rows written while the current branch was empty.

Plan:

- A shared `activeBranchId()` helper (terminal binding → current branch → saved branch) used by every write path: sales, shifts, shift sessions, drawer events, held orders, audit logs, stock adjustments, SKU audit, bookings, transfers.
- Writes refuse to save a blank branch id where the column is meant to be filled, showing a clear message instead of writing an orphan row.
- A new `supabase/sql/21_backfill_branch_ids.sql` that fills blank branch columns from the related record (sale → shift → terminal) and, where nothing can be derived, from the single branch when only one exists. You run this file against your own database, alongside the other files in `supabase/sql/`.
- Settings → Diagnostics gains a "Branch id coverage" table: per table, how many rows have no branch id, so the result is visible before and after the backfill.

## Which database this touches

All of this stays on your own Supabase — the app's `supabaseExternal` client and the server relay that uses your POS service key. Nothing is read from or written to the Lovable-managed database, and no migration is run against it. The row counts cannot be checked from here for the same reason, which is why the diagnostics table comes first: you see the real numbers in your own database before running the backfill.

## Verification

- Open the desktop app with a shift already open: it loads straight into trading, no lock flash, cashier can sell.
- Close the shift: the lock panel appears, correctly naming the terminal's branch.
- Take a sale, open/close the drawer, hold a bill: each new row carries the branch id.
- Diagnostics shows zero blank branch ids after the backfill.