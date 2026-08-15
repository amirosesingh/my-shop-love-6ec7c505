# Phase 4 — Finish two-way sync

Phase 3 closed the "who wins" question. What is still missing is the other
half of convergence: several things a till needs are only ever sent **up**,
never brought **down**. Until that is fixed, an offline till cannot see work
done at head office or at another branch.

## What is wrong today

- The till only pulls reference data down: stores, tiers, products, barcodes,
  categories, units, promotions, suppliers.
- **Members are never pulled.** A member signed up at branch B is invisible at
  branch A while it is offline, so points and tier discounts are wrong there.
- **Incoming stock transfers are never pulled.** A branch cannot receive a
  transfer sent to it unless it is online at that moment.
- **Bookings are never pulled**, so a racket booked at one till cannot be
  handed over from another till while offline.
- Settings are re-downloaded in full on every cycle instead of only when they
  changed.
- The desktop queue can park a change as "quarantined", and the Sync hub can
  retry it, but there is no way to see those rows or to drop one for good —
  only browser-queued changes appear in the "needs attention" list.

## What this phase does

1. **Pull the operational data a branch actually needs**
   - Members and membership changes come down on every cycle.
   - Stock transfers and their items come down when this branch is the sender
     or the receiver, so a transfer can be received offline.
   - Bookings and their payments come down for this branch.
   - Each of these keeps its own resume mark, so one slow table never holds
     the rest back, and the newer-copy rule from Phase 3 decides every merge.

2. **Only download what changed**
   - Settings get the same resume mark as everything else instead of a full
     fetch each cycle.

3. **One "needs attention" list for the whole till**
   - The Sync hub lists parked changes from both the browser queue and the
     desktop queue in one place, with Retry and, for admins, Discard.
   - Discard is added to the desktop side so a change that can never succeed
     can be cleared without editing the database by hand.

4. **Cross-branch safety**
   - Pulled rows stay inside this branch's scope: a till never downloads
     another branch's sales, shifts or drawer events.

## Technical notes

- `electron/db/repo.cjs`: extend the pulled-table list beyond
  `CATALOGUE_TABLES` with a new branch-scoped set (`members`,
  `stock_transfers`, `stock_transfer_items`, `bookings`, `booking_payments`),
  each with its own filter expression; add `discardRow(table, id)` alongside
  `retryRow`, plus an IPC handler in `electron/main.cjs` and a
  `preload.cjs` binding.
- `electron/sync/worker.cjs`: `pull()` iterates the scoped set with
  `selectChangedSince` + per-table watermark and merges through
  `mergeFromCloud` (already version-aware); `pos_settings` moves onto a
  watermark instead of an unconditional `maybeSingle()`.
- `src/lib/sync-engine.ts`: add the same tables to `PULL_TABLES` so the web
  and Android builds count them in the change probe.
- `src/lib/local-db.ts`: add `discardRow` to the bridge type.
- `src/components/pos/sync/SyncHub.tsx`: merge `queueView()` entries with the
  desktop `queueRows` from `localEngineInfo`/status into one attention table.
- Version bump to 1.3.3.
