# POS Data Authority, History & Terminal Recovery

Delivered in stages. Stage 1 is a written audit you review before any code changes.
Nothing after Stage 1 starts until you approve the audit findings.

## What I already confirmed by reading the code

These are verified now, not assumed from earlier messages:

- A feature registry exists (`src/lib/feature-schema.ts`, 720 lines) with sync direction,
  restore requirement and security class per table. It is real and reusable — it will not
  be rebuilt.
- A sync coverage matrix exists (`src/lib/sync-coverage.ts`), is surfaced in Logic Health,
  and is regenerated into a document by `scripts/sync-coverage.cjs`.
- Cloud-authoritative restore exists for 22 tables (sales, shifts, cash counts,
  reconciliations, drawer, purchasing, stock counts, governance trail), branch-scoped and
  date-windowed, in dependency order.
- Shift closing already has a free-text mandatory reason, a one-way step machine
  (reason → blind count → review), server-side reconciliation and recount. This will be
  verified, not rewritten.
- Booking cancellation reason and the collect/cancel/refund server routines exist.
- **Stock Requests do not exist anywhere in the codebase** — only Stock Transfers.
- **There is no status-history table.** `activity_events` records a title, a message and a
  free JSON blob; it has no entity id, no previous status and no new status column, so
  status transitions are not structurally queryable or verifiable.
- **There is no tombstone or soft-delete propagation.** A deletion in the cloud cannot be
  reliably reflected on a till that was offline when it happened.
- `audit_logs` cannot be restored — the cloud copy has no branch column.
- There are 42 separate settings pages.

## Stage 1 — Audit report (review gate)

A single document classifying every feature and requirement as COMPLETE, PARTIAL,
IN PROGRESS, PENDING, BROKEN, DUPLICATE or NOT REQUIRED, each with a file/line or a
database query as evidence. It covers:

- every business feature discovered by scanning the code, not a supplied list
- for each: required tables, columns, relationships, statuses, permissions, events
- application code vs local SQL schema vs cloud schema vs sync mapping, field by field
- a recovery verdict per feature: PASS / PARTIAL / FAIL, naming the exact missing table,
  column, relationship, history or mapping when it is not PASS
- duplicate or obsolete code candidates, each with path, purpose, risk and a
  recommendation — nothing deleted without your approval

You review this before Stage 2.

## Stage 2 — Status history and business events

- New `entity_status_history` table (cloud + local + sync + restore): entity type, entity
  id, previous status, new status, actor, branch, terminal, reason, related transaction,
  timestamp. Immutable.
- Extend `activity_events` with entity type, entity id, previous state and new state so
  business events are queryable rather than text.
- Write transitions from the existing flows: sale, refund, void, payment, booking, job,
  pay-later, shift open/close, cash count, recount, variance, transfer, receipt,
  adjustment, purchase, approval, cancellation.
- Both tables join the restore set so history survives a wipe.

## Stage 3 — Stock Requests (new feature)

Full lifecycle: REQUESTED → APPROVED / REJECTED → FULFILLING → DISPATCHED → RECEIVED →
COMPLETED, with partial fulfilment and partial receiving.

- Cloud tables `stock_requests` and `stock_request_items` with requested, approved and
  fulfilled quantities, RLS and grants.
- Same tables locally, in the guarded schema file, with sync, scoped pull and restore.
- Approval and rejection gated by the existing permission and approval system.
- Fulfilment creates a stock transfer, so dispatch and receiving reuse working code.
- Every transition writes to the Stage 2 history table.
- Screens for raising, approving, fulfilling and receiving requests.

## Stage 4 — Deletion safety and identity

- Tombstone/soft-delete columns on synced business tables so an offline till cannot
  resurrect a deleted or archived record.
- Confirm stable business identifiers survive reinstall and prevent duplicates; fix only
  the tables where the audit shows a real gap.
- Document the existing conflict rules per data class (finalised sale immutable, payment
  as controlled event, inventory movement-based, status validated transition) and correct
  only confirmed defects.

## Stage 5 — Recovery readiness diagnostics

Extend the existing Logic Health coverage view into a per-feature table showing Local,
Cloud, Sync, Schema and Recovery status with the reason for any failure — so a missing
cloud column reads as "Recovery: FAIL — approved_quantity missing from cloud" instead of
requiring three pages.

## Stage 6 — Fresh-terminal recovery test

Seed realistic branch data, confirm cloud sync, wipe the local database, re-authorise the
terminal, restore, then verify relationships, identifiers, current status, historical
status, events, balances, inventory, bookings, pay-later, requests, transfers, purchasing
and reports — and post a new transaction that syncs. Findings recorded and any gap closed.

## Stage 7 — Settings restructure

Regroup the 42 pages into four groups — Business, Operations, Users & Control, System —
with compact, equal-sized cards, short descriptions and no duplicated entries. Sync and
Database consolidate under System with Connection & Health, Synchronisation, Data & Schema
and Diagnostics sections. Navigation and labels change; behaviour does not.

## Stage 8 — Security sweep and final report

Scan for paths that bypass cloud authority, permissions, payment validation, status
validation or the audit trail — server routines, public API routes, Electron IPC, Android
bridges, background workers and offline queues. Then the final matrix: what was already
complete, what was partial, what was broken, what was built, what was deliberately left
alone, and the list of cleanup candidates awaiting your approval.

## Technical notes

- Cloud schema changes go through migrations with grants and RLS; the local mirror is
  added to `database/schema.sql` using the existing `IF NOT EXISTS` guarded style and to
  `src/lib/central-schema.ts` so drift detection stays accurate.
- New tables are added to `TABLES`, `PUSH_TABLES`, `cloud-columns.json`, and the scoped
  pull or restore list in `electron/db/repo.cjs`, and declared in the feature registry so
  the coverage matrix flags any gap automatically.
- Existing working code — shift close, booking collect/cancel/refund, transfers, checkout
  — is verified and preserved, not rewritten.
- Version bumped per shipped stage.
