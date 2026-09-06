# POS-wide performance, stability and import reliability

The goal: the till stays responsive under real load, a 1,700-row import never loses a
row, and every heavy screen loads or fails clearly instead of hanging. Nothing about
security, activation, branch rules, access policies, audit trails, shift protections or
sync integrity is removed or loosened.

## What has already been confirmed in the code

Two things are established by reading the current code, not guessed:

- The bulk import saves **one product at a time in a loop** (`BulkImportDialog.tsx`
  line 165 onwards). Each row triggers a separate save round-trip, a separate audit-log
  write, and a separate app-state update. For 1,700 rows that is roughly 5,000 separate
  operations fired back-to-back — enough on its own to pin the processor, block the
  window, and leave the job half-done when the app is killed. A batch save routine
  (`commitProducts`) already exists in the project and is simply not being used here.
- The parsing stage also updates the on-screen progress on **every single row** and
  pauses artificially every 5 rows, so reading the file alone re-renders the screen
  1,700 times.

Everything else below is stated as something to measure, not as a diagnosis. The exact
cause of the high processor use, of "Today's processing" hanging and of "POS did not
start correctly" will be named with evidence during Stage 1, before any related fix.

## Stage 1 — Measure first (no behaviour changes)

- Add lightweight timing around startup steps, database reads, search, barcode lookup,
  import batches, sync passes and report generation. Off by default in normal use,
  visible on the diagnostics screen.
- Record processor and memory use for both halves of the desktop app, count messages
  passing between them, count live database subscriptions, timers and listeners.
- Reproduce the 1,700-row import and the hanging processing screen with these
  measurements running, and capture the exact order of events leading to the freeze.
- Deliverable: a findings note with real numbers. Stages 3+ are then re-prioritised
  against it.

## Stage 2 — Rebuild the product import (the known problem)

New import engine, replacing the per-row loop:

- Parse and validate the whole file first, updating progress in chunks, not per row.
- Normalise rows, detect duplicates in one pass against an indexed lookup, not a
  per-row scan of the whole catalogue.
- Save in batches (starting at 200 rows, tunable after measurement), each batch
  idempotent and keyed so a retry cannot create duplicates.
- One audit entry per batch summarising it, instead of 1,700 individual entries; the
  detail stays available in the import record.
- Refresh what's on screen once at the end (plus progress), never once per row.
- Existing branch ownership, permission checks and product rules stay exactly as they
  are — they move from per-row to per-batch, they are not skipped.

Result and recovery:

- Every import writes an import record: id, total rows, imported, updated, skipped,
  failed, still pending — with a specific reason per skipped/failed row (duplicate
  barcode, duplicate code, missing name, invalid price, rejected by the database,
  no permission, connection lost, and so on). Downloadable as a file.
- Because progress is stored per batch, an import interrupted by a crash can be
  reopened and resumed: already-saved rows are recognised and not re-created, the
  remainder is offered for retry. Transient failures retry with increasing delay;
  validation failures do not retry.
- A verification step at the end compares rows in the file against rows in the
  database and reports any discrepancy rather than declaring success.

For the current situation: the tool will be able to tell you exactly which of the 1,700
rows are in the database and which are not, and let you finish the remaining ones.

## Stage 3 — Products and catalogue

Indexed lookup for barcode and code against the local copy first; paged/virtualised
product list so a large catalogue never renders in one go; debounced search; fetch only
the columns a screen needs instead of whole rows; no full-catalogue download where a
filtered query will do.

## Stage 4 — Heavy screens: processing, reports, analytics

Totals computed by the database rather than by downloading thousands of rows and adding
them up on the till. Every one of these screens gets: a bounded query, a real error
state with a retry button, and a guaranteed end to loading. The "Today's processing"
screen is fixed against whatever Stage 1 shows is actually holding it.

## Stage 5 — Desktop app, local database and sync

- Remove blocking work from the app's main process; move long file and database work
  off the responsive path.
- One sync worker at a time, incremental rather than whole-table, with proper backoff;
  bulk changes such as an import produce one sync pass, not seventeen hundred.
- Live subscriptions created once, torn down on leaving a screen, and never duplicated
  by navigating back and forth; bulk events coalesced.
- Timer, listener and subscription leak sweep so the app stays stable over a long day.

## Stage 6 — Startup

Trace the whole start sequence and make it ordered, repeatable and observable, with
each step timed and its own failure surfaced by name. "POS did not start correctly"
gets replaced by the actual failing step and a sensible recovery action. Timeouts are
not simply raised, and no activation or security check is skipped.

## Stage 7 — Verify

Type check, lint, the full existing test suite, plus new tests for the import engine
(batching, duplicates, resume, failure accounting). Then a measured run: 1,700-row
import while searching, scanning and checking out, with before/after numbers for
processor use, memory, query times and responsiveness. A desktop build and startup test
on both a clean install and an existing one.

## Final report

Root causes for each symptom, slow queries and indexes changed (each justified),
problems found in the interface, desktop app, local database, sync and subscriptions,
files changed, tests run, before/after measurements, and remaining risks. Anything not
actually measured will be labelled as such.

## Technical notes

- Import engine as a dedicated module with a pure validate/normalise/dedupe core that
  is unit-testable, driven by an existing batch commit path rather than the per-item
  save; progress via a chunked reducer.
- Import state persisted in the local database with a stable per-row key derived from
  the file so resume and idempotency are exact.
- Aggregation pushed into database routines/queries; indexes proposed only with the
  query they serve, the expected gain and the write cost, and never by touching access
  policies.
- Parsing of large files moved off the interface thread if measurement shows it is the
  blocker.

## Scope note

This is a large body of work. Stage 1 and 2 fix the reported crash and data loss and
will land first; Stages 3-6 will be sequenced against the Stage 1 measurements so
effort goes where the numbers say it matters.
