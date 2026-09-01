# Remaining audit phases — P2 tail and P5

Checked the codebase against the Phase 2 plan. Most of it is already in place:
transactional restore, shift completeness (cash counts, close events,
reconciliations, variance alerts), schema alignment (branch_id, booking_ref,
receipt_prefix, reversed_at/by, counted_by_user_id, actor_user_id all present in
the push contract), and settings recovery.

Two items are still open.

## 1. Governance offline trail (P2 tail)

`activity_events` and `record_edits` already fall back to a local park when the
cloud call fails. Approval requests, approval decisions and member OTP
verification still write cloud-only, so an approval or verification taken during
an outage leaves no record on the till.

Work:
- Wrap the approval calls in `src/lib/authorization.server.ts` callers and the
  verification calls in `src/lib/verification.server.ts` callers with the
  existing `withGovernanceFallback` helper, parking to
  `authorization_requests`, `authorization_log` and `member_verifications`.
- Surface a clear message in the approval and verification dialogs when an
  action was recorded locally and will sync later ("recorded on this till").
- Verification without a connection cannot deliver an OTP, so keep OTP send
  online-only and park only the attempt record, with the dialog saying so.

These tables are already in the till schema, the push list and the restore list,
so parked rows travel up on the next sync with no schema change.

## 2. Coverage matrix from the registry (P5)

`src/lib/sync-coverage.ts` derives the push/pull/restore matrix but nothing
renders it, and `src/lib/feature-schema.ts` has no per-feature sync intent, so
a new feature can still be added with no sync decision and nobody notices.

Work:
- Add optional `syncDirection` ("push" | "pull" | "both" | "cloud-only"),
  `restoreRequired` and `securityClass` to each feature op in
  `feature-schema.ts` (additive, existing entries keep working).
- Have `buildCoverage` compare the declared intent against the actual contract
  reported by the sync bridge and flag mismatches.
- Render the matrix as a "Sync coverage" section in the existing Logic Health
  dashboard: one row per table, with push/pull/restore ticks, the cloud-only
  reason where applicable, and a warning row for any table a feature touches
  with no sync decision.

## Notes

- No database migration is needed for either item.
- Version bump via `node scripts/bump-version.cjs` on completion.
