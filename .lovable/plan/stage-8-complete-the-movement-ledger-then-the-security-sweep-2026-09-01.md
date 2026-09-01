# Stage 8 — complete the movement ledger, then the security sweep

Two items are still open in the audit. Everything else in the state audit is
marked COMPLETE with evidence.

## 1. Item history is missing goods-received and transfer movements

Confirmed in the code: `item_activity_logs` rows are only ever built by
`saleActivityRows` in `src/lib/pos-db.ts` and attached to a sale commit.
Receiving a purchase order and receiving or dispatching a stock transfer both
change stock on hand but write no movement row, so an item's history shows the
sales that took stock out and nothing that put it in.

Work:
- Add movement builders alongside `saleActivityRows`: one per received purchase
  line (`activity_type: "receive"`, positive delta, reference = the goods
  received number, unit cost from the line) and one per transfer line at
  dispatch (negative, sending branch) and at receive (positive, receiving
  branch), referenced by the transfer number.
- Attach them to the same commit as the stock change so a movement can never be
  written without its stock delta, and reuse `stableChildId` so a retry after a
  restart does not duplicate rows.
- Drafts and cancelled receiving orders write nothing.
- No schema change: `item_activity_logs` already carries every column needed,
  and it is already pushed and restorable.
- Backfill is out of scope — history starts from this release forward, and the
  item history screen will say so for earlier stock.

## 2. Security sweep and the final report

A last pass over what the audit already listed as sensitive, checking rather
than rewriting:
- Every public route under `src/routes/api/public/*` verifies its caller
  before doing any work, and returns no personal data.
- Row-level security is enabled with a policy on every central table the till
  touches, and every table has the matching grants.
- No secret material appears in any pushed, pulled or restored table; the
  central-only list keeps its stated reason per table.
- The relay's table allow-list and store-column map cover exactly the tables
  the till pushes — nothing wider.
- Run the security linter and the existing test suite; record findings.

Anything the sweep turns up gets fixed if it is small and reported to you with
a recommendation if it is not.

Then `docs/audit/state-audit.md` is refreshed: inventory moves to COMPLETE, a
Stage 8 section records the sweep result, and the "what happens next" list is
replaced by a short closing statement.

## Technical notes

- `src/lib/pos-db.ts`: new `receivingActivityRows` and `transferActivityRows`
  next to `saleActivityRows`; attached in the receiving-invoice commit and in
  the dispatch/receive paths in `src/lib/stock-transfers.ts`.
- `src/lib/feature-schema.ts`: point the inventory-movement operation at the
  new sources so the coverage matrix stays accurate.
- Regenerate `docs/audit/sync-coverage.md` and `docs/audit/recovery.md` with
  `bun scripts/sync-coverage.cjs`.
- Version bump via `node scripts/bump-version.cjs`.
