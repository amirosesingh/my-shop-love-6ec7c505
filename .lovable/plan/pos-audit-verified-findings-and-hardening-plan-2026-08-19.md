# POS audit — verified findings and hardening plan

## What the audit found (verified against the code, not the old doc)

The existing `docs/system-audit.md` is broadly right but imprecise. I re-ran the
suite (`bunx vitest run`: 81 passed, 5 failed) and read the implementation behind
each claim.

Architecture as it actually stands:

- **UI/shell**: `src/components/pos/AppShell.tsx` is the single gate — it blocks
  anonymous users (`if (!user) return <TerminalLogin />`), maps each path to a
  permission via `ROUTE_PERMISSIONS`, fails closed on unmapped paths
  (`?? "unknown"`) and renders `<PermissionDenied>` instead of the page body.
- **Permissions**: `src/lib/permissions.ts` holds the flag list, role presets and
  groups; action gates use `requirePermission(...)`.
- **Data access**: `src/lib/db-router.ts` (`dbRouter`/`dbProxy`) is the only
  approved path; `src/lib/db-mode.ts` decides local vs online, with automatic
  failover.
- **Booking**: general booking is already cart-driven with no service fee;
  racket service is the only flow with a labour charge.

### Confirmed real issues

1. **Route security gap (REAL)** — `/stock-operations` and `/verifications` have
   no `ROUTE_PERMISSIONS` entry. Both files do render inside `AppShell`, so the
   fail-closed default denies them today — but they are denied to *everyone*
   including admins-by-flag, which is a correctness bug as well as an undeclared
   permission. `/pos` is only a phantom from the redirect stubs.
2. **Database ownership violation (REAL)** — `src/lib/branch-settings.ts` imports
   the managed client `@/integrations/supabase/client` and uses it for six reads
   and writes against `settings_locks` / `settings_overrides`.
3. **Payment methods load has no failure handling (REAL, narrower than reported)**
   — save and delete already return `{success, error}` and toast correctly. The
   initial `loadPaymentTypes()` and the two `setRows(await loadPaymentTypes())`
   refreshes are unguarded: a dropped connection leaves a permanent spinner or
   stale rows with a success toast.
4. **Till database mode (DECIDED)** — `defaultDatabaseMode()` returns `"online"`
   on every platform. Per your answer, desktop should be local-first.
5. **Cashier booking flags (OUTDATED TEST)** — you confirmed cashiers legitimately
   create bookings and collect part-payments; the test snapshot is stale.
6. **Redirect-only routes (TEST BLIND SPOT)** — the seven `pos.*` / `settings.*`
   stubs are pure `beforeLoad` redirects with no component. The guard test treats
   "no AppShell" as unguarded. You chose to keep them, so the test must learn
   that a redirect-only route renders no UI.

### Not changing (verified correct / intentional)

- General booking: no service picker, no fee, cart-driven totals, scan + search
  inside the dialog — already implemented as intended.
- Racket service, `serviceFee` / `serviceName` columns, booking write order
  (`bookAndPayLater` → `createBooking` → `commitBooking`, print/drawer only after
  the write resolves), deposit + terms validation before persistence, shared slip
  terms/signature layout. Historical bookings stay printable.
- `src/routes/index.tsx` will not be rewritten. No speculative extraction.

## Changes to make

**Security**
- Add `"/stock-operations": "can_adjust_stock"` and
  `"/verifications": "can_view_member_history"` to `ROUTE_PERMISSIONS`, matching
  the flags those screens' actions already use.
- Route-guard test: teach it that a route file with no `component` and only a
  `redirect(...)` in `beforeLoad` renders nothing, so it is neither "unguarded"
  nor in need of a permission entry. Derive the phantom `/pos` the same way. No
  whitelist of filenames, no weakened assertions.

**Database ownership**
- Rewrite the six calls in `src/lib/branch-settings.ts` onto `dbRouter`
  (`query` / `upsert` / `delete`), preserving signatures, typing and behaviour.
- Sweep the rest of `src/` for the same import pattern and report anything else
  found.

**Reliability**
- `PaymentMethodsPanel`: wrap the initial load and both refreshes in try/catch,
  surface failures with the existing `sonner` toast, add an error state instead
  of an endless spinner with a retry action, and keep rows unchanged when a
  refresh fails. Save/delete keep their existing guarded shape and `busy` lock.

**Database mode**
- Make `defaultDatabaseMode()` platform-aware: local on Electron/native shells
  (via the existing `isDesktop()` helper in `src/lib/native.ts`), online in the
  browser, still pinned online when `isLiveOnly()`. Failover and sync untouched.
- `db-mode.test.ts` keeps asserting local-first and gains a case for the browser
  default, with the test's window stub extended to simulate a desktop shell.

**Permissions**
- Add `can_create_booking` and `can_collect_booking` to the cashier snapshot in
  `permissions.security.test.ts`, with a comment recording the business rule.
  The "never grants cashiers money/settings/staff" test stays untouched.

**Copy**
- Settings → Services: reword the "use service types" help text to say it applies
  to racket service jobs only. Wording only.

## Verification

`bunx vitest run`, `tsgo --noEmit`, `node scripts/logic-scan.cjs`, and
`bunx eslint` on the touched files. Lint autofix limited to files I change —
no repo-wide reformat. Browser pass over the booking flow (scan into the dialog,
qty-to-zero manager gate, deposit minimum, terms gate, slip print) and over
`/stock-operations` + `/verifications` access as a cashier vs an authorised role.
Anything I cannot verify — Electron/MSSQL offline behaviour has no sandbox — I
will state plainly rather than claim.
