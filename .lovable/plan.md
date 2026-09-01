# Stage 4 — Deletions, paging and written conflict rules

Stage 3 (stock requests through the transfer lifecycle) is done. Stage 4 closes
the last structural sync gaps before the wipe-and-restore test in Stage 6.

## What's wrong today

Confirmed by reading the code and schema just now:

- **Deletions never travel.** There is no `deleted_at` column anywhere in the
  central schema or the till's schema. If head office deletes a product, a
  promotion or a member while a till is offline, that row stays on the till
  forever — it reappears in search and can still be sold.
- **Routine pull has no paging.** The delta pull asks for every row changed
  since the last watermark in one request. Restore pages properly in 1,000-row
  batches, but a till that has been off for a fortnight, or a large catalogue
  update, silently truncates at the server's row cap.
- **Conflict rules are unwritten.** Version-aware writes and immutability
  triggers exist and work, but nothing states which side wins, per table.

## What gets built

### 1. Tombstones — deletions that reach every till

- Add `deleted_at` to the tables a till mirrors and head office can delete
  from: products, categories, barcodes, units, suppliers, promotions,
  membership tiers, stores, members.
- Deleting through the app becomes a soft delete: the row is stamped, never
  removed, so the change has something to travel on.
- The till's pull treats an arriving `deleted_at` as "remove this row locally",
  and every local read filters stamped rows out.
- Transactional history (sales, payments, shifts, transfers) is never
  tombstoned — those are immutable by design.

Products already have `archived_at`, which hides a product from sale but keeps
it for history. Tombstones sit alongside that and mean something stronger:
gone. Existing archive behaviour is untouched.

### 2. Paged routine pull

Give the ordinary delta pull the same 1,000-row paging the restore path
already uses, looping until a short page arrives, so a long outage or a bulk
catalogue edit comes down complete instead of truncated.

### 3. Written conflict rules

A short reference table — one row per synced table — stating the authority
(cloud wins / till wins / append-only / immutable), the tie-breaker, and what
happens when both sides changed. Published in the docs and surfaced as a
read-only panel in Logic Health so the rule that applies is visible where the
sync state is.

## Technical notes

- Central migration: `deleted_at timestamptz` on the nine tables above, plus a
  partial index on `(updated_at)` where `deleted_at is not null` so tombstones
  come down on the normal watermark.
- Mirrored into `database/schema.sql`, `electron/db/offline_sqlite_v2.sql`,
  `electron/db/cloud-columns.json` and `src/lib/central-schema.ts`.
- `electron/db/repo.cjs`: pull applies deletes; `electron/sync/worker.cjs`:
  paging loop shared with restore.
- Public read policies gain `deleted_at is null` so a deleted row stops being
  readable through the Data API too.
- Rules table lives in `docs/audit/conflict-rules.md`, generated from a typed
  map in `src/lib/sync-coverage.ts` so it cannot drift from the code.

## Not in this stage

Recovery verdicts in Logic Health (Stage 5), the wipe-and-restore test
(Stage 6), the settings restructure (Stage 7).
