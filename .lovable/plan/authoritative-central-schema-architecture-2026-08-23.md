# Authoritative Central Schema Architecture

Replace the local-vs-central schema comparison with a versioned, authoritative central schema definition. The central database is validated only against that definition — never against the local till schema. No destructive changes; no automatic migrations; all existing business and audit data is preserved.

## Phase 1 — Diagnostic report (no data changes)

Produce `docs/central-schema-diagnostic.md` covering:

1. **Current schema architecture** — how `SchemaPanel`, `central-drift.ts`, `cloud-columns.json`, and the PostgREST `cloudSchema` read interact today.
2. **Dependency map** — which central tables/columns each report, sync table, audit view, and web-admin page requires (from `COMPARE_TABLES`, `RELAY_TABLES`, report routes, and the relay policy).
3. **Fetch failures** — Held Orders, Stock Transfers, Promotions, Member Tiers, Members, Shift Sessions: trace frontend request → endpoint → query → table → returned shape. Expected common cause candidates to verify: RLS denial returning errors, PostgREST schema-cache staleness after column changes, or select-lists referencing missing columns. Surface the real underlying error text in the UI instead of generic "unable to fetch".
4. **"Situation" errors** — the word does not exist in the codebase, so it comes from a runtime/API error message. Trace it from the live preview console/network logs to its origin before proposing any fix. No renaming or suppressing.
5. **Stock reconciliation** — read `stock_reconcile`, `stock_apply_deltas`, and the Stock Adjustment report to locate why "branch stock does not match the movement applied" fires. Classify each mismatch (genuine discrepancy / duplicate / missing / failed sync / wrong branch) before any correction; corrections only as new auditable adjustment events.
6. **Data-loss risks** — confirm `order_id`, `payment_method`, `transaction_reference` and any other extra central columns are classified legacy/informational and never dropped.

## Phase 2 — Authoritative central schema definition

- Create `src/lib/central-schema.ts` as the single source of truth:
  - `CENTRAL_SCHEMA_VERSION` (separate from app version 1.3.37 and local DB version).
  - Per-table specs for every synced table: column name, PostgreSQL type, nullability, default, classification (`required` / `optional` / `legacy`).
  - Primary keys, the `client_transaction_id` idempotency columns on `sales` and `payment_transactions`, unique constraints, and important indexes.
  - Seeded from the verified sync contract (`electron/db/cloud-columns.json`), the central settings extras (`pos_settings.receipt_css`, `pos_store_settings.{require_pin_terminal_reset,row_version,updated_by}`), and the known-good central table list. Curated manually thereafter.
- Extend the relay's `cloudSchema` read (`src/lib/pos-relay.server.ts`) and `fetchCentralSchema` (`src/lib/central-schema.functions.ts`) to also return each column's type and nullability from the PostgREST definitions document, so type drift is visible, not just missing names.

## Phase 3 — Drift engine rewrite

- Rewrite `src/lib/central-drift.ts` to compare **authoritative definition ↔ actual central schema** only. Remove the dependency on `COMPARE_TABLES` and the local manifest.
- Extra central columns (not in the definition) are reported as **legacy/informational** in a separate list — never as errors, never in the repair script.
- `buildCentralRepairSql`: additive-only statements with authoritative types/defaults; rename the idempotency index to `payment_transactions_client_txn_idx`; keep `notify pgrst, 'reload schema';` so the API layer picks up changes immediately. Missing tables still block the script with a clear message. No DROP, DELETE, or data rewrite statements are ever generated.

## Phase 4 — Schema Manager UI

- Redesign `CentralSchemaCard` in `src/components/database/SchemaPanel.tsx`:
  - Header shows **Expected central schema version** and **Detected status**.
  - Separate counts: genuine drift vs. legacy/extra columns (expandable, informational).
  - Keep the manual workflow: check → review exact differences → download PostgreSQL script → run in the central SQL editor → re-check.
- Add a **Sync compatibility** section to the local SQL Server panel: validates the local database holds everything the sync contract needs — explicitly labelled as local validation, separate from central validation. Local-only columns (`is_synced`, `sync_status`, `last_error_at`, …) and local-only tables (`sync_state`, `system_settings`, `transfers`, `shift_notifications`) never appear as central findings.

## Phase 5 — Fetch-error diagnostics in UI

- Where the six failing features surface errors, replace generic "unable to fetch" with the actual underlying error (HTTP status + PostgREST/RLS message), so the common root cause found in Phase 1 stays visible and fixable.

## Phase 6 — Tests

Rewrite `src/lib/__tests__/central-drift.test.ts` plus new tests:

- **A** Current known central state → exactly the 5 genuine missing columns, zero false positives.
- **B** Fully repaired central → zero drift.
- **C** Local sync columns present locally → no central drift.
- **D** Local-only tables → no central drift.
- **E** `client_transaction_id` required on `sales` + `payment_transactions`, not on unrelated local-only tables.
- **F** Legacy extra columns → informational only, no destructive repair statements.
- **G–J** (report continuity, audit context, offline sync idempotency, stock reconciliation): test the pure-logic portions (expected-spec completeness for report tables, drift-vs-sync-contract consistency, reconcile classification logic) as unit tests; full end-to-end sync/reconcile verification happens manually against the live preview per Phase 6–8 of the rollout order.

## Phase 7 — Verification & release

- Run the full test suite and lint.
- Manual verification in preview: Schema Manager detects the 5 known drifts, repair script runs cleanly, re-check shows zero genuine drift, Sync Hub retries parked rows.
- Bump version with `node scripts/bump-version.cjs`.

## Technical details

- Files created: `src/lib/central-schema.ts`, `docs/central-schema-diagnostic.md`.
- Files edited: `src/lib/central-drift.ts` (rewrite), `src/lib/central-schema.functions.ts`, `src/lib/pos-relay.server.ts` (cloudSchema metadata), `src/components/database/SchemaPanel.tsx` (central card + sync-compatibility section), error-surfacing in the six failing fetch paths, `src/lib/__tests__/central-drift.test.ts` (rewrite).
- Explicitly out of scope: automatic production migrations, dropping/renaming any central column, marking rows synced without central confirmation, overwriting branch stock to hide mismatches.
