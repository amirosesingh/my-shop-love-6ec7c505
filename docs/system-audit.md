# POS system audit — 17 Aug 2026

Scope: full read of `src/`, `electron/`, route tree, database schema and test suite,
after the general-booking change (cart-driven booking, no service fee, single slip layout).

## 1. What changed in this pass

| Area | Change |
| --- | --- |
| General booking | Service picker and service-fee box removed. Booking total = cart total only. |
| General booking | Items being booked are listed inside the dialog with qty +/- and a scan bar + catalogue search, driving the same `lines` state as the register ticket. |
| Booking slip | `serviceTermsBlock()` and the "accepted at intake" line are no longer gated on `booking.job`, so a general booking prints exactly the same terms + signature layout as a racket job. |
| Racket service | Untouched — it remains the only flow with a labour/service charge. |

New file: `src/components/pos/booking/BookingCartPanel.tsx`.

## 2. Blocking issues — resolved 19 Aug 2026

All five test failures and the three critical logic-scan findings are closed.
`bunx vitest run`: 88 passed. `tsgo --noEmit`: clean. `node scripts/logic-scan.cjs`:
0 critical.

1. **Route permissions.** `/stock-operations` → `can_adjust_stock` and
   `/verifications` → `can_view_member_history` are now declared in the AppShell
   route map, so authorised roles reach them and everyone else hits
   `PermissionDenied` by an explicit rule rather than the fail-closed default. A new
   test asserts both entries.
2. **Redirect-only routes kept.** The two `pos.*` stubs and the five legacy
   `settings.*` stubs declare no `component` and only throw `redirect()` in
   `beforeLoad`, so they render no page body. The guard test now detects that shape
   itself instead of carrying a filename whitelist. `/pos` was only a phantom of
   those stubs.
3. **Cashier preset.** `can_create_booking` / `can_collect_booking` are intentional:
   cashiers raise bookings and take deposits at the till. Cancelling still needs a
   supervisor. The preset snapshot records the rule.
4. **Database ownership.** `src/lib/branch-settings.ts` now reads and writes
   `settings_overrides` / `settings_locks` through `dbRouter`. A repo-wide sweep
   found no other managed-client import outside `src/integrations/`.
5. **Database mode.** `defaultDatabaseMode()` is platform-aware: local-first inside
   the Electron shell (background reconciliation unchanged), online-first with local
   failover in a back-office browser, pinned online on the live-only phone build.
6. **Payment methods.** Load, save and delete are wrapped; a failed load shows a
   retry panel instead of an endless spinner, a failed delete leaves the row on
   screen, and a failed post-save refresh says so rather than showing stale rows.

## 3. Should fix

- **Redirect-only routes.** Kept deliberately so old bookmarks and deep links keep
  working; they forward to the destination that carries the permission.
- **`useServiceTypes` setting.** Copy on Settings → Services now says the switch
  applies to racket service jobs only. Behaviour unchanged.
- **`serviceFee` / `serviceName` on `Booking`.** Still written by the racket flow and read
  by `chargesBlock()`; for general bookings they are now always undefined. Historical rows
  keep printing correctly, so no migration is needed, but the columns are effectively
  racket-only and should be documented as such.
- **Prettier drift.** `bunx eslint src/routes/index.tsx` reports ~485 formatting-only
  errors, all auto-fixable. Run `bunx eslint --fix` on the routes folder in a dedicated
  commit so real lint errors stop being buried.
- **`src/routes/index.tsx` is 4.1k lines.** The racket intake, tender flow and canvas
  wiring all live in it. Continue the extraction started with `BookingCartPanel` —
  next candidates: the racket intake body and the tender/checkout block.

## 4. Verified working

- Every `to="/..."` link in routes and components resolves to a real route file
  (`/`, `/holds`, `/reports`, `/reports/notifications`, `/settings`, `/settings/data-sync`,
  `/settings/notifications`, `/settings/security-alerts`, `/settings/system`, `/stores`,
  `/transfers`) — no broken navigation targets.
- Typecheck passes clean (`tsgo --noEmit`).
- Booking write path: `bookAndPayLater` → `createBooking` → `commitBooking`; drawer and
  print only run after the write resolves.
- Deposit rules (minimum deposit, allowed timings, terms acceptance) are enforced before
  the write, not after.
- Booking slip and part-payment receipt both read the same receipt profile, so branch
  overrides apply to both.

## 5. Suggested test pass (manual)

1. Open a shift, scan an item, open **Book & pay later** — the item appears in the dialog list.
2. Scan a second barcode from inside the dialog — it lands in the same list and the total updates.
3. Reduce a qty to zero inside the dialog — the manager-approval gate fires.
4. Take a deposit below the branch minimum — save is refused with the required amount.
5. Save without ticking the terms box — refused.
6. Save and print — slip shows items, totals, deposit, balance, collect-by, terms, signature rule.
7. Repeat for a racket job — same slip layout plus the job block and labour charge.
