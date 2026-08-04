# Database-driven shifts + hard terminal lock

## What changes for you

- A shift stays open until someone explicitly closes it. Opened Monday, still open Thursday — no date or time logic anywhere in the lookup.
- Every till reads the open shift straight from the database, so all terminals in a branch agree on what is open.
- With no open shift, the terminal is locked behind a full-screen "Open shift" screen: no navigation, products, cart or checkout until a cash float is entered.
- The sign-in crash caused by a stale local cache is fixed, and the error screen gets a real reload button plus "Clear local cache and restart".

## Database work

The `shifts` table already exists with `opened_at`, `closed_at`, `opening_float`, `counted_cash` and terminal/staff attribution. One additive migration adds:

- `status` text, `'OPEN' | 'CLOSED'`, default `'OPEN'`, backfilled from `closed_at` (null = OPEN).
- `closing_float` numeric, nullable, alongside the existing counted-cash field.
- `user_id` uuid, nullable — the signed-in account that opened the shift.
- A partial index on `(store_id, opened_at desc) where status = 'OPEN'` for the active-shift lookup.
- A trigger keeping `status` and `closed_at` consistent so old rows and offline sync writes cannot drift.

Worth flagging: `store_id` stays `text`. Branch ids in this app are terminal-generated codes, not uuids, and shifts, sales and terminals all reference them — converting the column would orphan live data. Behaviour is unchanged.

## Application work

- `src/lib/pos-db.ts`: map the new columns; add `loadActiveShift(storeId)` running exactly `where store_id = $1 and status = 'OPEN' order by opened_at desc limit 1`. Open writes a new row with `status = 'OPEN'` and `opened_at = now()`; close updates that row with `status = 'CLOSED'`, `closed_at = now()` and the closing float. No date filtering anywhere.
- `src/lib/pos-store.tsx`: `activeShift` comes from that database lookup for the current branch (falling back to the cached snapshot only when offline) instead of scanning local state for a row without `closed_at`.
- New `src/components/pos/ShiftGuard.tsx`: fetches the active shift on login and branch change. When one exists it shows the open date, time and float in the header strip and unlocks the register; when none exists it renders an un-dismissable overlay with cashier name and opening cash float plus an "Open Shift" action. Mounted inside `AppShell` so sidebar and register are both covered.
- `src/routes/index.tsx` and `src/routes/shifts.tsx`: reuse the guard's open/close actions and drop the ad-hoc "no shift" inline states the overlay replaces.
- Shift history on `src/routes/shifts.tsx`: one row per shift showing exact `opened_at` and `closed_at` date/time, duration, opening and closing float, who opened it and who closed it, plus the existing overdue badge.

## Safe boot and error handling

- `src/lib/offline-snapshot.ts`: normalise every slice on read (`products`, `members`, `sales`, `shifts`, `promotions`, `stores` default to `[]`; non-arrays discarded) and drop a snapshot that fails to parse.
- `src/lib/pos-store.tsx`: `applyCloud` uses `cloud.shifts ?? []`-style defaults throughout, and the snapshot-apply step is wrapped so a corrupt cache clears itself instead of crashing sign-in.
- `src/routes/__root.tsx`: "Try again" performs `window.location.reload()`; a second button clears the offline snapshot (`pos.offline.snapshot.v1`) and cached POS state before reloading. Terminal registration, credentials and printer settings stay untouched.

## Technical notes

- Migration is additive; no existing shift row is closed by it.
- Offline writes keep flowing through the existing outbox, now carrying `status`.
- Terminal-bound close rules (same PC, or manager/admin override) and overdue reminders stay as they are.
- Version bump to the next patch so the desktop and APK feeds pick up the change.