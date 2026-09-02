# Phase 3 & 4 — stock product table, and a real database health check

Phases 1 and 2 (no privileged key on the device, Emergency Access + Recovery
settings) are shipped in v1.3.76. These are the two remaining approved items.

## Phase 3 — Stock Transfer / Receiver product table

Today `ProductPicker` is an 84-line filtered list: one line per product (name,
one code, on-hand at the working branch), a 208px scroll box, first 25 matches,
click-a-row-to-add, and it filters the whole catalogue already sitting in
browser state. `TransferComposer` is its only consumer; `/receiving/$id` has no
picker.

Rework the picker only — the surrounding transfer and receiving forms stay as
they are.

- Compact fixed-header table with its own internal scroll:
  **Barcode | Item | Branch | Available | Qty | Add**.
  The Branch column appears only where a destination branch is in play
  (transfers); it shows destination on-hand next to source on-hand.
- Scan/search box that accepts keyboard-wedge input: an exact barcode match on
  Enter adds the line immediately at qty 1 (or the typed qty) and clears the
  box, so a cashier can scan a stack of items without touching the mouse.
- Per-row quantity input plus an explicit **Add** button; clicking the row no
  longer silently adds. Re-adding an existing product increments its line
  rather than duplicating it.
- Server-side search instead of scanning the in-memory catalogue: debounced
  (250ms) query against the indexed product/barcode lookup, capped result set,
  so a large catalogue is never pulled into the client. When the device is
  offline or the query fails, it falls back to the products already in local
  state so the till keeps working.
- Reuse the picker in `/receiving/$id` for the case where an arriving line is
  not on the note (extra/unlisted item), keeping the blind-count behaviour.

## Phase 4 — Database health check and migration generator

Today `central-schema.ts` holds the authoritative definition and
`central-drift.ts` compares tables, columns and a coarse type family, using the
PostgREST root document. `schema-health.ts` then emits an additive, versioned
migration that records itself in `schema_migrations`. Nullability, defaults,
primary keys, foreign keys, constraints, indexes, functions, triggers, RLS and
policies are not compared at all, and no security statements are ever
generated. The local side is Microsoft SQL Server with `database/schema.sql` as
master and the same coverage limit.

### Cloud (central PostgreSQL)

- Introspect through a read-only SQL inventory call over the existing service
  relay (`information_schema` + `pg_catalog`) instead of the PostgREST root
  document, which structurally cannot expose constraints, triggers or policies.
  If that call is unavailable on the connected project, the check degrades to
  today's PostgREST table/column comparison and says so plainly rather than
  reporting false "all clear".
- Extend the authoritative definition and the comparison to: nullability,
  defaults, primary keys, foreign keys, unique/check constraints, indexes,
  functions, triggers, RLS enabled state and policies.
- Emit **one complete migration file** per scan covering schema *and* security:
  `alter table ... add column if not exists`, `create index if not exists`,
  `alter table ... enable row level security`, and policies created only when
  absent. Every statement is additive and guarded.

### Local (Microsoft SQL Server on the PC)

- Same comparison for the subset SQL Server actually has: tables, columns,
  types, nullability, defaults, primary keys, foreign keys, unique/check
  constraints, indexes, and triggers. No RLS/policies — that concept does not
  exist there.
- Introspect via `sys.*` / `INFORMATION_SCHEMA` through the existing Electron
  SQL bridge, and emit guarded T-SQL (`IF COL_LENGTH(...) IS NULL`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes ...)`) in the existing
  `local_NNN` file format. No new local database architecture is introduced.

### Safety

- Nothing is ever dropped or recreated. Objects found in the database but not
  in the definition stay untouched and are listed as legacy/informational;
  where a drop would be the theoretically correct repair, it is emitted only as
  a commented-out suggestion.
- The generated file still records itself in `schema_migrations` in the target
  database and is tracked locally, so a re-scan only surfaces genuinely new
  drift.

## Technical notes

- Phase 3: rewrite `src/components/pos/ProductPicker.tsx` (table layout, qty +
  Add, scanner input, debounced remote search with local fallback); small
  wiring changes in `src/components/pos/TransferComposer.tsx` and
  `src/routes/receiving.$id.tsx`. A new search helper in `src/lib/pos-db.ts`
  (or the nearest existing product-lookup module) does the limited server-side
  query.
- Phase 4: `src/lib/central-schema.ts` gains constraint/index/policy/trigger
  metadata; `src/lib/central-drift.ts` gains the new comparison dimensions and
  the SQL-inventory input shape; `src/lib/schema-health.ts` gains the security
  section and index/constraint emission for both dialects;
  `src/components/database/SchemaHealthPanel.tsx` and `SchemaPanel.tsx` show
  the new categories and the degraded-introspection notice.
- Tests: picker search/scan/dedupe/qty behaviour; drift comparison fed a
  captured real inventory must report exactly the known gaps and zero
  false positives; generated SQL must contain no `drop` statement outside a
  comment, in either dialect.
- Version bumped with `node scripts/bump-version.cjs` on completion.
