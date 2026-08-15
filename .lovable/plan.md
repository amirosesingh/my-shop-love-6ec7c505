# Phase 5 — Offline-tolerant read paths

Phases 2–4 are complete: schema and watermarks, offline-first bill numbering, delta-based
inventory sync, and per-table pull marks. The remaining item from the plan is the last
architectural flaw: admin and report screens still read the central database directly, so
they show a hard error when the line is down instead of degrading to the terminal copy.

## What changes

- **Item activity drawer** — its four reads (stock adjustments, transfer lines, product
  lookup, audit trail) go through the router, so opening an item's history offline shows
  the last known movements instead of an error.
- **Sessions screen** — the sign-in session list reads through the router and shows a
  "showing the last synced copy" note when the data came from this terminal.
- **Staff manager** — the staff list falls back to the terminal copy for viewing;
  create/edit/delete stay online-only and disable themselves with a clear reason when the
  connection is down (staff changes must never be queued).
- **Shared empty/stale state** — one small banner used by these screens so the operator
  always knows whether they are looking at live or cached data.

## Verification

- Typecheck passes.
- With the network blocked in the preview, each of these screens renders cached rows and
  the stale banner rather than an error.

## Technical notes

- Reads move from `supabaseExternal.from(...)` to `dbRouter.query(table, { match, orderBy,
  limit })`, which already prefers the live source and falls back to the local snapshot on
  connection-class failures only — permission and validation errors still surface.
- Tables not present in the snapshot return no cached rows; those screens show the empty
  state with the offline note instead of silently pretending the list is empty.
- No schema change and no migration in this phase.
