# Stage 5 — Recovery verdicts per feature

Stage 4 (tombstones, paged pull, written conflict rules) is done. Stage 5 is the
last piece before the wipe-and-restore test: making the question *"if this till
died tonight, what would come back?"* answerable on screen, per feature, from
the code rather than from a hand-written table.

## What's missing today

The state audit answers that question in a markdown table written by hand, so it
goes stale the moment a feature changes. On screen, Logic Health shows sync
coverage table-by-table (`SyncCoverageSection`) — accurate, but a shopkeeper
reading it cannot tell whether *bookings* or *stock transfers* would survive a
rebuild, only whether individual tables are pulled or restorable.

## What gets built

### 1. A derived recovery verdict per feature

For each feature in the registry, roll up the tables it touches into one verdict:

- **Full** — every table the feature needs comes back on a rebuild, whether by
  restore or by the routine pull.
- **Partial** — the record comes back but some of its trail does not; the
  missing pieces are named in plain words.
- **None** — nothing of this feature survives a wipe.
- **Not needed** — the feature reads central data online by design (coupons,
  vouchers, staff accounts).

The verdict is computed from the same inputs the coverage matrix already uses —
declared intent, restore requirement and the till's real push/pull/restore lists
— so it cannot drift from the code.

### 2. Recovery panel in Logic Health

A new section above sync coverage: one row per feature, its verdict, and — where
it is not Full — the specific data that would be lost, written for someone who
runs a shop, not someone who reads schemas. A headline line summarises it
("18 of 20 features rebuild completely").

On web and Android, where there is no local database, the panel shows the
declared intent and says the live comparison needs a till.

### 3. The audit document, generated

`docs/audit/state-audit.md`'s recovery table stops being hand-maintained: the
same generator that writes the sync coverage and conflict-rules documents also
writes `docs/audit/recovery.md`, run by `bun scripts/sync-coverage.cjs`.

## Technical notes

- New `recoveryVerdicts(contract)` in `src/lib/sync-coverage.ts`, grouping
  `FEATURES` by their non-RPC tables, resolving each table through
  `buildCoverage`, and reducing to a verdict with reasons.
- Cloud-only tables count as satisfied, not as a gap.
- New `RecoverySection.tsx` under `src/components/pos/settings/panels/`,
  rendered by `LogicHealthPanel` above the coverage section, reusing the same
  `pos:sync-contract` bridge call (fetched once and shared).
- `scripts/sync-coverage.cjs` gains a third output, `docs/audit/recovery.md`,
  from a new `formatRecovery()`.
- Version bump via `node scripts/bump-version.cjs`.

## Not in this stage

The wipe-and-restore test (Stage 6) and the settings restructure (Stage 7).
