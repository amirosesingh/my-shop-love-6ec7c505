# Stage 4 — Server vs. Shop Data Comparison page

A page that answers one question for a manager: "does what the shop till holds match what the server holds?" — per table, with the rows that differ, and one-click ways to fix them.

## Where it lives

New tab **Data comparison** inside the System & general settings hub (next to the existing Data sync tab), reachable from the sync popover in the top bar. Admin/manager only, same permission gate the sync hub uses.

## What it shows

Header row: branch being compared, when the comparison ran, "Compare now" button, and an overall verdict (In step / Behind / Ahead / Mismatch).

Per-table table (all synced tables — sales, sale items, payments, bookings, transfers, stock adjustments, products, members, etc.):

| Column | Meaning |
| --- | --- |
| Table | Friendly name (e.g. "Sales") |
| Shop | Row count in the till's local database |
| Server | Row count on the central server for this branch |
| Difference | +/- and a status chip: matched, waiting to upload, not yet downloaded, mismatch |
| Last change | Newest change timestamp on each side |

Expanding a row lists the actual differing records (id, date, amount/name where available), grouped as:
- **On the till only** — queued or never uploaded
- **On the server only** — not yet downloaded to this till
- **Different on both sides** — same record, different last-changed time

Row-level actions: "Upload now" (re-queue the local row), "Download now" (pull that record), "Open record". Table-level actions: "Push table", "Pull table". Nothing is deleted automatically.

Comparison is scoped to the till's branch and to a chosen window (Today / 7 days / 30 days / All) so it stays fast on large tables.

## Behaviour rules

- Comparison is read-only until the operator presses an action.
- On a browser till (no local database), the page explains that comparison needs the desktop app and shows only the server side.
- If the server is unreachable, the page shows the shop side and says the server could not be read — it never reports a false mismatch.
- Counts and row lists come from live queries, not cached sync counters, so a stuck queue is visible.

## Technical notes

- **Shop side**: new `compareSnapshot({ tables, since })` in `electron/db/repo.cjs` returning per table `{ count, maxUpdatedAt, pending, errored }` plus, on drill-down, `id + updated_at` lists; exposed through a new `db:compare-*` IPC pair in `electron/main.cjs` and `electron/preload.cjs` (added to `src/lib/local-db.ts` typings).
- **Server side**: `src/lib/data-compare.functions.ts` — `createServerFn` with `requireSupabaseAuth`, role-checked through `context.supabase`, branch-scoped counts (`head: true, count: "exact"`), `max(updated_at)`, and paged `id, updated_at` lists capped per table.
- **Diff engine**: `src/lib/data-compare.ts` — pure functions that merge the two id/timestamp maps into the three difference groups; unit-tested.
- **UI**: `src/components/pos/sync/DataComparison.tsx`, rendered from `src/routes/settings.system.tsx` under a `compare` tab, registered in `src/lib/settings-catalog.tsx` / `settings-groups.ts`. Reuses the existing sync push/pull and row re-queue helpers for the actions.
- No schema changes; reads only existing tables.
