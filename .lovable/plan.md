# Phase 4 — a real database health check and migration generator

Phase 3 (product table picker) shipped in v1.3.77. This is the last approved
item: make the schema check see the things it currently cannot, and make the
generated repair file complete.

## What the check can see today

- Central (cloud): `central-drift.ts` compares the authoritative definition in
  `central-schema.ts` against the PostgREST description document. That document
  only exposes tables, columns and a coarse type. Nullability, defaults, primary
  keys, foreign keys, unique/check constraints, indexes, functions, triggers,
  row-security state and policies are never compared.
- Local (SQL Server): the Electron bridge reports missing tables and columns
  only, with `database/schema.sql` as master.
- The generated file adds missing columns as `text` and records itself in
  `schema_migrations`. It never emits indexes, constraints or security
  statements.

## What changes

### Deeper introspection

- Read the central database through a read-only SQL inventory over the existing
  service relay (`information_schema` + `pg_catalog` + `pg_policies`) instead of
  the PostgREST document. The database already exposes a `schema_inventory`
  helper; extend it (or add a companion read) to return columns with
  nullability and defaults, primary keys, foreign keys, unique/check
  constraints, indexes, triggers, RLS enabled state and policy names per table.
- When that read is unavailable on the connected project, fall back to today's
  PostgREST table/column comparison and say plainly on screen that the check is
  running in reduced mode — never report "all clear" from a degraded scan.
- Local side: introspect `sys.*` / `INFORMATION_SCHEMA` through the existing
  Electron SQL bridge for the subset SQL Server has (tables, columns, types,
  nullability, defaults, primary keys, foreign keys, unique/check constraints,
  indexes, triggers). No RLS or policies there.

### Wider comparison

- `central-schema.ts` gains the extra metadata per table: column nullability and
  default, primary key, foreign keys, unique/check constraints, expected
  indexes, expected triggers, whether row security must be on, and the expected
  policies.
- `central-drift.ts` reports each of these as its own category, keeping the
  existing required / optional / legacy split. Objects found in the database but
  absent from the definition stay informational and are never repaired.

### Complete, safe repair file

- One file per environment per scan, covering schema and security together:
  `alter table ... add column if not exists` with the real type, default and a
  separate `set not null` only when safe, `create index if not exists`,
  constraint adds guarded by a catalogue check, `alter table ... enable row
  level security`, and policies created only when absent.
- Nothing is ever dropped or recreated. Where a drop would be the textbook
  repair, it is emitted as a commented-out suggestion only.
- T-SQL equivalent for the local file keeps the existing guarded style
  (`IF COL_LENGTH(...) IS NULL`, `IF NOT EXISTS (SELECT 1 FROM sys.indexes ...)`)
  and the `local_NNN` filename format.
- The file still records itself in `schema_migrations` in the target database and
  is tracked locally, so a re-scan only surfaces genuinely new drift.

### Screens

- `SchemaHealthPanel.tsx` and `SchemaPanel.tsx` group findings by category
  (missing tables, missing columns, nullability/defaults, keys and constraints,
  indexes, triggers, row security, policies) with counts, and show the
  reduced-mode notice when deep introspection is unavailable.

## Technical notes

- Files: `src/lib/central-schema.ts` (constraint/index/trigger/policy metadata),
  `src/lib/central-drift.ts` (new comparison dimensions plus the SQL-inventory
  input shape, PostgREST input kept for the fallback),
  `src/lib/schema-health.ts` (typed column emission, index/constraint/security
  sections, both dialects), `src/lib/db-health.ts` (inventory read),
  `src/components/database/SchemaHealthPanel.tsx`, `SchemaPanel.tsx`.
- A migration adds the extended read-only inventory function centrally, granted
  to the roles the relay uses.
- Tests: the comparison fed a captured real inventory must report exactly the
  known gaps and zero false positives; a repaired inventory must report zero
  drift; generated SQL must contain no `drop` outside a comment, in either
  dialect.
- Version bumped with `node scripts/bump-version.cjs` on completion.
