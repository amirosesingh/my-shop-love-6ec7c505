# Authoritative Central Schema for the Schema Manager

Replace the central-schema comparison (local SQL Server schema → central PostgreSQL) with an authoritative central schema definition → actual central PostgreSQL. Central validation, local-till validation, and sync compatibility become three clearly separate concepts.

## Current state (verified by reading the code)

- `src/lib/central-drift.ts` derives "expected central columns" at runtime from the **local** master schema (`database/schema.sql` via the Schema Manager manifest) narrowed by the push contract (`electron/db/cloud-columns.json`), plus a small hardcoded `CENTRAL_EXTRA_SPECS` list. This already kills most false positives, but the local schema is still the source of truth — exactly what this change removes.
- `src/components/database/SchemaPanel.tsx` renders both the local SQL Server manager and the `CentralSchemaCard`, which builds `expected` from the local manifest and reports missing columns only.
- `src/lib/central-schema.functions.ts` + `pos-relay.server.ts` (`cloudSchema`) read the actual central schema from the PostgREST root document (table/column pairs; the document also carries type and required/nullable info we can capture).
- Local-only tables `sync_state`, `system_settings`, `transfers`, `shift_notifications` exist only in `database/schema.sql`; none are in the push contract.
- Existing tests: `src/lib/__tests__/central-drift.test.ts` (will be rewritten to the new API).

## 1. Authoritative central schema definition — `src/lib/central-schema.ts`

New committed module, the single source of truth for the central PostgreSQL schema. **Not** derived from the local till schema at runtime.

- `CENTRAL_SCHEMA_VERSION` (starts at `"1.0.0"`, bumped by hand whenever the definition changes — separate from the app version).
- `CENTRAL_SCHEMA`: per central table — columns with `{ name, pgType, nullable, default? }`, plus `indexes` and notable `constraints` (e.g. primary keys).
- Initial baseline generated once by a new `scripts/build-central-schema.cjs` from the already-verified contract (push columns in `cloud-columns.json` + the verified central-only settings columns), mapped to PostgreSQL types, then committed and curated by hand from then on. The app never runs this derivation.
- `LOCAL_ONLY_TABLES` (`sync_state`, `system_settings`, `transfers`, `shift_notifications`) and `LOCAL_ONLY_COLUMNS` (`is_synced`, `sync_status`, `last_error_at`, `synced_at`, `pending_sync`, `sync_attempts`, `sync_error`) exported as explicit documentation/test anchors.
- `client_transaction_id` is in the authoritative schema on exactly `sales` and `payment_transactions` — the idempotency guard is preserved and appears nowhere else.

## 2. Rewrite `src/lib/central-drift.ts`

- `computeCentralDrift(cloud)` compares `CENTRAL_SCHEMA` against the actual central introspection — no manifest, no `COMPARE_TABLES` input. Missing tables and missing columns only; a local-only column/table can never appear because it is never in the definition.
- Also computes `extraColumns` per table (present centrally, absent from the definition) as **informational legacy data** — never part of the repair, never an error. This surfaces `order_id`, `payment_method`, `transaction_reference`-style columns separately.
- `buildCentralRepairSql(drift)` emits only additive `alter table … add column if not exists` statements using the authoritative `pgType`/`nullable`/`default`, plus the idempotency index `create unique index if not exists "payment_transactions_client_txn_idx" on public.payment_transactions (client_transaction_id) where client_transaction_id is not null;` when that column is repaired, and `notify pgrst, 'reload schema';` at the end. Missing tables still block the script (needs the full secured migration). Never drops anything; legacy columns never generate statements.

## 3. Central schema read — small relay extension

- Extend the `cloudSchema` read in `pos-relay.server.ts` and `central-schema.functions.ts` to also return each column's type and required/nullable flag from the PostgREST document. Used only for optional informational "type differs" hints; absence of the data degrades gracefully. No write paths change.

## 4. Schema Manager UI — `SchemaPanel.tsx`

- `CentralSchemaCard` no longer receives the local manifest; it compares the authoritative definition against the central database only.
- New status block for non-technical operators:
  ```text
  Central Database Status
  Schema status: Healthy            (or: Schema repair required)
  Expected schema: v1.0.0
  Detected: matches v1.0.0          (or: differs — 5 column(s) missing)
  Unexpected legacy columns: n — informational, collapsible, never repaired
  Local-only till columns and tables: ignored
  ```
- Keep the existing workflow unchanged: Check central schema → review genuine differences → Download central PostgreSQL repair script → operator runs it manually in the central project's SQL editor. No automatic migration, no production writes.

## 5. Sync compatibility — separate from central validation

- Add a small "Sync compatibility" section to the local SQL Server panel: verifies the **local** database contains every column the push contract needs (per synced table) plus the sync bookkeeping columns. This answers "can this till sync?" without touching central validation. Missing push columns are reported here as local problems, not central drift.

## 6. Tests — rewrite `src/lib/__tests__/central-drift.test.ts`

1. Verified current central schema → exactly 5 missing: `payment_transactions.client_transaction_id`, `pos_settings.receipt_css`, `pos_store_settings.require_pin_terminal_reset`, `pos_store_settings.row_version`, `pos_store_settings.updated_by`. Nothing else.
2. Repaired schema → zero drift.
3. Local-only columns (`is_synced`, `sync_status`, `last_error_at`, `sync_attempts`, `sync_error`) → never central errors.
4. Local-only tables (`sync_state`, `system_settings`, `transfers`, `shift_notifications`) → never missing central tables.
5. `client_transaction_id` required on `sales` and `payment_transactions` only; on other tables it creates no drift.
6. Legacy central columns (`order_id`, `payment_method`, `transaction_reference`) → reported as informational extras only, no repair statements, never dropped.
Plus repair-script assertions: additive-only statements, the `payment_transactions_client_txn_idx` index, and the `notify pgrst` reload.

## 7. Verification & wrap-up

- Run the new tests, the existing test suite, and lint/build.
- Preserve all existing behaviour: Sync Hub, parked-row retry, payment idempotency (a row is marked synced only after central confirms), permissions, connection config.
- Manual acceptance path documented for the operator: scan → exactly 5 genuine missing columns → run downloaded script in the central SQL editor → re-scan shows zero drift → Sync Hub "Retry parked rows" syncs parked payments exactly once.
- Bump the app version with `node scripts/bump-version.cjs` only after everything passes.

## Out of scope / safety

No automatic PostgreSQL migrations, no drops of columns/tables, no deletion or recreation of parked payments, no changes to checkout/sync logic, no use of the local SQL Server schema as the central authority.
