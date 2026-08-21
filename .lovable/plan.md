# Remaining work after the driver-isolation release (1.3.24)

The Electron connection crash work, the isolated Windows-auth driver and the
durable crash logging are done and tested (216 tests). What is still open is
the list the deep audit produced, plus one thing only you can do (test on the
real shop PC).

## 1. Security gaps that are still live in the database

Confirmed by querying the live policies just now — these are not stale notes:

- `member_verifications` has three policies (`_staff_read`, `_staff_write`,
  `_staff_update`) whose condition is literally `true` for every signed-in
  user. The names promise staff-only, nothing enforces it. Any logged-in
  account can read or alter member OTP verification rows.
- `product_barcodes_write` is `ALL` with `true` for every signed-in user, so a
  cashier account can rewrite barcode-to-product mappings.
- Six legacy routines still exist and are executable
  (`upsert_terminal_user`, `delete_terminal_user`, `set_terminal_active`,
  `set_app_user_profile`, `staff_account_set_pin`, `user_cluster_id`). No app
  code calls them.

Fix: replace the three `member_verifications` policies with staff-and-branch
checks using the existing `is_staff_now()` / branch helpers; scope
`product_barcodes_write` to staff with the inventory permission and leave reads
as they are; revoke EXECUTE from `anon`/`authenticated` on the six routines
(revoke rather than drop, so an old till build cannot hard-fail — drop in a
later release once nothing calls them).

## 2. Duplicate bill numbers on a storage failure

`src/lib/bill-number.ts` swallows three exceptions with a comment only. If the
storage write fails, the counter does not advance and the next sale can reuse a
bill number. Fix: surface the failure, refuse to hand out a number that was not
durably reserved, and fall back to the server sequence instead of a silent
local guess.

## 3. Seven pages have no title or description

`pos.general-booking`, `pos.racket-service`, `settings.data-sync`,
`settings.diagnostics`, `settings.inheritance`, `settings.logic-health`,
`settings.security-alerts` — each needs its own `head()` with a specific title
and description.

## 4. Smaller cleanups

- One shared guard for `/api/public/*` handlers, so a future endpoint cannot
  ship without caller verification (today each file verifies itself).
- Collapse the duplicated storage keys (`pos.theme` / `pos.ui.theme`,
  `pos.ui-scale` / `pos.ui.scale`) onto one key each with a read-through
  migration.
- Make the column-tolerance fallbacks in `pos-db.ts` log once when they trigger,
  so schema drift stops being invisible.

## 5. Only you can finish this one: the shop PC test

Everything about the Windows-auth crash was fixed and tested with simulated
hangs and crashes, but this sandbox has no SQL Server and no Windows. On your
machine, please confirm:

1. Install the new build, open Setup connection with Windows Integrated
   Authentication + Direct connection, `PCNAME\SQLEXPRESS` with the port filled
   in. It should either connect or fail with a message — never take the app
   down.
2. Stop it mid-handshake. The till stays open and can retry.
3. Break it deliberately three times (wrong port). It should stop auto-retrying
   and show a hard error instead of looping.
4. Remove saved connection, then set it up fresh.
5. Press "Save diagnostic report" and check `diagnostic-report.txt` appears.

If any of those crashes, send me that report file and I will work from it.

## Suggested order

Security (1) first, then bill numbering (2), then the page metadata (3) and
cleanups (4). Item 5 runs in parallel on your side.

## Technical notes

- Policy changes go in one migration with the standard shape: drop the
  permissive policy, create the scoped one, keep the existing GRANTs.
- Routine lockdown is `REVOKE EXECUTE ... FROM anon, authenticated` only; no
  drops in this release.
- `bill-number.ts` change is behavioural: the reservation must be awaited and a
  failure must reject, so the checkout path shows the existing "could not be
  stored" modal rather than continuing.
- No changes to the Electron driver layer are proposed here; it is stable and
  under test.
