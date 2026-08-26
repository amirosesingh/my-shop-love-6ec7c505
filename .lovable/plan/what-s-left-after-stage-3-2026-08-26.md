# What's left after Stage 3

Stages 1–3 are done and shipped at 1.3.41 (security fixes, Android data-loss fix, web/Android as online-only clients, hardware honesty). Checking the older follow-up list against the live project: the `member_verifications` and `product_barcodes` policies are already scoped to staff, so those are closed. Four items remain.

## 1. Duplicate bill numbers on a storage failure

`src/lib/bill-number.ts` swallows several exceptions silently. If the counter write fails, the number is not durably reserved and the next sale can reuse it. Change: a failed reservation must reject rather than return a guessed number, falling back to the server sequence, so checkout shows the existing "could not be stored" message instead of quietly issuing a duplicate.

## 2. Four pages have no title or description

`pos.general-booking`, `pos.racket-service`, `settings.diagnostics`, `settings.security-alerts` each get their own `head()` with a specific title and description. (The other title-less files are pure redirects and need none.)

## 3. Shared guard for public endpoints

Each `/api/public/*` handler verifies its caller on its own today. Add one shared guard helper used by all of them, so a future endpoint cannot ship unprotected.

## 4. Small cleanups

- Collapse the duplicated storage keys (`pos.theme` / `pos.ui.theme`, `pos.ui-scale` / `pos.ui.scale`) onto one key each, reading the old key once and migrating.
- Make the column-tolerance fallbacks in `pos-db.ts` log once when they trigger, so schema drift stops being invisible.

## Stage 4 — dead code removal (separate, needs your go-ahead)

The online-only change left offline plumbing on web/Android that is now unreachable. Removing it is a bigger, riskier sweep; it stays parked until you ask for it explicitly.

## Technical notes

- `bill-number.ts` change is behavioural: the reservation is awaited and a failure rejects.
- No schema change, no migration, no RLS change in this batch.
- Verification: typecheck, production build, full test suite (252 tests) must stay green; version bump via `node scripts/bump-version.cjs`.
