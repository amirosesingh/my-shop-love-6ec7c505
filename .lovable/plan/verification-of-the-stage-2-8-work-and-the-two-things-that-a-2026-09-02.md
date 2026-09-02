# Verification of the Stage 2-8 work, and the two things that are off

I checked the actual code, not the completion notes. Result: the feature work is
in place, but two things do not match the claim of "everything complete".

## What is confirmed working

- Goods received write inventory movements: `receivingActivityRows` /
  `receivingActivityOps` in `src/lib/pos-db.ts`, attached inside the same commit
  as the invoice, keyed off the invoice so a resumed draft cannot double rows.
- The purchasing screen passes the receiving branch through on all three call
  sites (`src/routes/purchasing.tsx:710`, `:711`, `:843`), so movements are
  stamped with the branch stock actually landed in.
- Item history shows the new movement kinds — "Goods received",
  "Transferred out", "Transferred in" — plus the note that history starts from
  this release (`src/components/pos/ItemActivityDrawer.tsx`).
- The feature registry points the inventory-movement operation at the new
  sources (`src/lib/feature-schema.ts:143`).
- Every public endpoint names a guard: HMAC, shared secret, downstream caller
  verification, or an explicit public-read marker. Six of six.
- Version is 1.3.72.

## Problem 1 — the audit document contradicts the delivered work

`docs/audit/state-audit.md` section 2 is the summary table people read first,
and it still says Inventory is PARTIAL, Status history is PENDING, Stock
requests are PENDING, tombstones are PENDING, conflict rules are undocumented,
paging is missing and there is no per-feature recovery verdict. All seven were
delivered in Stages 2-6, and the later sections of the same document say so.
Only the table was never updated.

Work: rewrite those rows to COMPLETE with the evidence that now exists, and
replace section 7's "what happens next" list with a closing statement, since
every stage listed there is delivered.

## Problem 2 — two tests fail

`bunx vitest run` reports 284 passing, 2 failing, both timing out at 5s:

- `src/lib/__tests__/driver-install.test.ts` — "installs and reports the
  refreshed driver list"
- a companion pool/`resolveTarget` test that spies on
  `electron/db/discover.cjs`

Neither touches the ledger or the security sweep — they are ODBC driver
plumbing — but a red suite is a red suite. Work: read both tests, find whether
the hang is an unresolved promise in the mock or a real await that never
settles in the driver-install path, and fix the cause. If it turns out the code
under test is genuinely waiting on a machine-level install that cannot run in
CI, the test gets a proper fake instead of a longer timeout.

## Technical notes

- Docs only in Problem 1: `docs/audit/state-audit.md`. The generated files
  (`sync-coverage.md`, `recovery.md`, `conflict-rules.md`) are already accurate
  and are regenerated with `bun scripts/sync-coverage.cjs` if anything shifts.
- Problem 2 touches `src/lib/__tests__/driver-install.test.ts` and the pool
  test, and `electron/db/driver-install.cjs` only if the fault is in the source.
- Version bump with `node scripts/bump-version.cjs` at the end.
