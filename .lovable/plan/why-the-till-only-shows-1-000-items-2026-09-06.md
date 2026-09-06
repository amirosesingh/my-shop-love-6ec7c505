# Why the till only shows 1,000 items

## What I found

The item list is downloaded in one request with no paging:

- `src/core/api/pos-db.ts` line 902 — `products` is read as a single `select("*")` with no page window.
- Same for `members` (line 903), `promotions` (918), `stores` (933) and the routed
  table reader in `src/core/api/db-query.ts`.

The central database caps any single request at 1,000 rows. So no matter how many
items exist, the till receives exactly the first 1,000 by name and silently treats
that as the whole catalogue — nothing errors, which is why it looked fine. The count
you see in the database is the real number; the POS is only being handed the first
page of it.

(The Lovable-managed database attached to this project has 0 products, so the real
count lives in your own connected database — the fix does not depend on knowing it.)

## The fix

### 1. A single paged reader

Add one helper that fetches a table in windows of 1,000 rows and keeps asking for the
next window until a short page comes back, then returns the whole set. It carries the
same filters and ordering as today, and orders by a stable key so no row is skipped or
repeated between pages.

### 2. Use it everywhere a full list is loaded

- products, members, promotions and stores in `loadCloudState`
- the routed table reader in `db-query.ts` (so offline snapshots and every screen that
  reads a table through it get the full set too)
- the offline snapshot written for the till, so the local copy is complete as well

Deliberately unchanged: reads that are meant to be bounded — recent sales (500),
recent shifts (300), search results (25), single-row lookups. Those are limits by
design, not accidents.

### 3. Safety rails

- A hard ceiling (e.g. 100,000 rows) so a runaway loop can never hang the till.
- If a page fails part-way, the load reports the failure instead of quietly returning a
  partial catalogue.
- A visible count on the inventory screen ("showing X of X items") so a truncated list
  can never hide again.

### 4. Verification

- New tests for the paged reader: exact multiples of the page size, short final page,
  empty table, mid-way failure.
- A run against a table with more than 1,000 rows confirming the count matches the
  database.
- Full test suite, lint, build; version bumped.

## Technical notes

- Paging uses PostgREST `.range(from, to)` with `count: "exact"` on the first page, so
  the expected total is known up front and can be asserted against what arrived.
- Ordering must be deterministic (`name, id` for products; `created_at, id` elsewhere);
  ordering by a non-unique column alone can drop or duplicate rows across pages.
- Pages are fetched sequentially with a small concurrency of 2-3 to keep large
  catalogues fast without hammering the database.
