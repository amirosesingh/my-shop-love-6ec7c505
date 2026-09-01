# Phase 1 — Feature, Data & Sync Audit (discovery only)

Discovery, mapping and gap identification only. No feature rewrites, no schema
migrations, no deletions in this phase. Every gap gets written down; fixes are
proposed and prioritised for Phase 2.

## What already exists (confirmed by reading the code)

- `src/lib/feature-schema.ts` — a live feature/data probe covering 10 feature
  groups (sales, transfers, venue bookings, ticket bookings, membership,
  inventory, purchasing, shifts, held orders & audit, coupons). Each declares the
  exact tables/columns its screens read and write and runs them against the live
  database. This is the closest thing to a Feature Registry and will be extended,
  not replaced.
- `src/lib/central-schema.ts` — authoritative cloud definition for 32 tables with
  drift detection (`central-drift.ts`); the backend currently has ~64 tables.
- `database/schema.sql` — guarded (`IF NOT EXISTS`) local SQL Server mirror.
- `src/lib/sync-engine.ts` — outbox push for local writes, plus a pull list of
  only 9 tables (`products, members, membership_tiers, promotions, stores,
  suppliers, bookings, stock_transfers, held_orders`).
- `src/lib/logic-health.ts`, `sync-audit.ts`, `system-audit.ts`, `record_edits`,
  `activity_events` — existing health/audit surfaces to reuse.

The narrow pull list is the first thing the audit will quantify: anything not on
it cannot come back down to a freshly installed till.

## Audit passes

1. **Feature discovery** — walk every route in `src/routes`, its components,
   store actions, `src/lib/*-db.ts` / `*.functions.ts` data access, `electron/db`
   repo methods, and the API routes. Produce one entry per real business feature,
   including non-obvious ones (approvals, coupons, terminal tokens, telemetry,
   drawer events, holds, data comparison, screen customisation).
2. **Dependency tracing** — for each feature record tables, columns,
   relationships, statuses, status history, events, permissions, config keys,
   branch/terminal scope, sync direction, offline behaviour.
3. **Deep dives** with their own write-ups: Pay Later / bookings money,
   booking lifecycle & statuses, Record Job, stock requests, stock transfers,
   inventory movement reconstruction, sales & payments.
4. **Three-way schema comparison** — app requirements vs `database/schema.sql`
   (local) vs live cloud tables (queried column-by-column, with types,
   nullability, defaults, foreign keys), not table-name matching.
5. **Sync coverage matrix** — per table: push, pull, initial restore,
   incremental, offline queue, tombstones, duplicate protection, conflict rule,
   branch/terminal scope.
6. **Fresh-install recovery test (on paper)** — for each feature answer "wipe the
   local database, reinstall, authorise the terminal, sync: does this still work?"
   with the exact reason for each FAIL.
7. **History audit** — which entities keep only `current_status` versus real
   status/event history (who, when, branch, terminal, before → after, reason).
8. **Field classification & security** — cloud-authoritative, branch-synced,
   global master, terminal-only, local-only, derived, secret. Explicitly list
   what must never leave the terminal (PIN hashes, device secrets, tokens, keys).
9. **Stable identity audit** — records created offline keep the same id after
   sync, reinstall and device replacement.
10. **Cleanup candidates** — duplicate/obsolete code listed with path, purpose,
    why it looks dead, dependants, risk and recommendation. Nothing deleted.

## Deliverables

- `docs/audit/feature-inventory.md` — complete feature list with status.
- `docs/audit/feature-dependencies.md` — per-feature data dependency map.
- `docs/audit/schema-comparison.md` — column-level local vs cloud vs app.
- `docs/audit/sync-matrix.md` — synchronisation coverage matrix.
- `docs/audit/recovery-gaps.md` — fresh-install PASS/FAIL per feature with cause.
- `docs/audit/history-gaps.md` — missing status/event history.
- `docs/audit/security-classification.md` — field classes and never-sync list.
- `docs/audit/cleanup-candidates.md` — for approval, not action.
- `docs/audit/phase-2-plan.md` — prioritised fixes (data-loss risk → recovery
  failure → financial integrity → sync → history → schema → performance →
  cleanup).
- **Feature Registry**: extend `src/lib/feature-schema.ts` with the missing
  feature groups and add registry metadata fields (sync direction, restore
  requirement, branch/terminal scope, statuses, history table, permissions,
  security class, last audit date), so the existing live probe becomes the single
  registry. A companion checklist in `docs/audit/registry-guide.md` describes what
  a new feature must declare so future work cannot silently skip sync/recovery.
- `roadmap.md` at the project root tracking the audit passes and the Phase 2 queue.

## Technical notes

- Cloud inspection uses read-only queries against `information_schema` and the
  existing PostgREST inspection in `central-schema.functions.ts`; no writes.
- Local expectations are read from `database/schema.sql` and
  `electron/db/repo.cjs` / `offline_sqlite_v2.sql`.
- Registry changes are additive metadata; existing probe behaviour and all
  working features (Record Job, bookings, Pay Later, stock, sales, inventory)
  stay untouched in this phase.
