# Phase 2 continued — governance offline, schema alignment, settings recovery

Phase 2 P0/P1 (transactional restore + shift-closing completeness) shipped in
v1.3.63. This stage closes the remaining items from the audit plan: P2, P3, P4,
P5.

## Part 1 — Governance actions work offline (P2)

Today activity events, record edits, authorization requests/actions and member
verifications are written straight to the cloud from server functions, so they
fail or are lost when the shop is offline, and they leave no on-terminal trail.

Move them onto the same router every other write uses:

- Route these writes through `dbRouter.write` so they land locally first and
  sync afterwards.
- Add the missing local tables (`record_edits`, `authorization_requests`,
  `authorization_actions`, `authorization_log`) to the offline schema;
  `activity_events` and `member_verifications` already exist locally.
- Add all of them to the desktop upload contract so parked rows flush on
  reconnect, and to the restore list so an approvals/audit history comes back
  after a rebuild.
- Keep the current cloud-direct behaviour on Web/Android (online-only there).

## Part 2 — Schema alignment (P3)

- Add the local-only business fields to the central schema so they stop being
  dropped on push: `sales.branch_id`, `sale_items.branch_id`,
  `activity_events.branch_id`, `bookings.booking_ref`,
  `stores.receipt_prefix`.
- Add the cloud-only fields to the offline schema:
  `booking_payments.reversed_at` / `reversed_by`,
  `shift_cash_counts.counted_by_user_id`, `shift_close_events.actor_user_id`.
- Retire the legacy `transfers` table from the desktop table list once nothing
  writes to it.
- Refresh the drift baseline so the Schema Manager reports clean afterwards.

## Part 3 — Settings recovery (P4)

Include `pos_settings` and the branch/cluster settings tables in the restore
pull, so a rebuilt terminal comes back with its real configuration (receipt
branding, rounding, payments, permissions) instead of defaults. Local settings
that are still waiting to push are never overwritten.

## Part 4 — Registry as the source of truth (P5)

Extend `src/lib/feature-schema.ts` additively with `syncDirection`,
`securityClass` and `restoreRequired` per feature, then generate the sync
coverage matrix from the registry instead of the hand-written audit file, so
this map cannot silently drift again. Surface it in the existing audit/health
screen.

## Technical notes

- Schema changes go into `database/schema.sql` as guarded (`IF NOT EXISTS`)
  statements plus a matching Supabase migration for the central side, following
  the existing idempotent pattern.
- Upload contract: `electron/db/cloud-columns.json`; restore list:
  `RESTORE_TABLES` in `electron/db/repo.cjs` with `restoreMerge` semantics
  (never clobber unsynced local rows).
- Server functions `activity-events.server.ts`, `record-edits.server.ts`,
  `authorization.server.ts`, `verification.server.ts` keep their signatures;
  only the storage target changes on desktop.
- Version bump via `node scripts/bump-version.cjs`; typecheck and the full test
  suite run at the end of each part.
