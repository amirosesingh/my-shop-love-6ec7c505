# Till stability, rule saving, permissions and store-bound terminals

Four connected fixes for cashier terminals.

## 1. The shift bar flickering after a cashier opens a shift

What is verified today: opening a shift is written through the server relay (which accepts a cashier PIN session), but **reading the open shift back goes straight to the database as the browser user**. The read rules on the shift table only allow signed-in staff accounts, and a cashier PIN session is not one — so the read comes back empty or refused. The register then flips between "shift open" (local state) and "terminal locked" (fresh read), which is the fluctuation.

Fix: give the terminal a read path that matches its write path.
- Add a read side to the same trusted server endpoint the till already uses for writes, proving the caller by cashier session or terminal token, and return the current open shift for the branch.
- The register uses it whenever there is no signed-in staff account, and never downgrades a locally confirmed open shift to "locked" on a failed or refused read — it keeps the last known good state and shows a small "reconnecting" note instead.
- Same treatment on shift refresh, so a hiccup cannot lock a trading till mid-sale.

## 2. "permission denied for function pos_rules_save"

The save routine is granted only to signed-in accounts; the till is calling it without one, or the grant was never applied on the live POS database. Fix:
- Route rule saving through the trusted server path (it already enforces supervisors-only), so the till never calls the database routine directly with the wrong identity.
- Ship a small SQL file to run once on the POS database that re-applies the execute grants for the rules routines.
- Make the fallback order explicit: save to the local database first; if unavailable, save to the central database; if both are down, queue and retry.
- Failures show the real reason in the toast instead of a raw error code.

## 3. Show which permission is missing

Blocked actions today either hide themselves or fail silently. Add one shared "permission required" surface:
- Blocked screens show "You need the *Open a shift* permission — ask a supervisor", using the human label of the exact toggle.
- Blocked buttons show the same wording in a toast instead of doing nothing.
- The shift panel names the missing toggle when a cashier cannot open a shift.
- Audit the full permission list so every screen and action maps to a real toggle.

## 4. Default role matrices and terminal-bound stores

Defaults per role (starting point; every toggle still editable per person):
- Cashier: register, hold, reprint, bookings, member lookup/add, open + close own shift.
- Warehouse: inventory, purchase orders, stock adjust, transfers, locations.
- Supervisor / Admin: everything.

Store binding — the vulnerability you described. Today the branch follows the *person*, so a staff member assigned to another store can sign in on this PC and pull that store's data. Change it so the branch follows the *terminal*:
- Each activated terminal is bound to one store; that store is fixed for everyone who signs in on it.
- Any user signing in on that terminal trades in the terminal's store — the staff record's own store no longer selects the branch there.
- The branch switcher is hidden on a bound terminal, including for supervisors and admins (they still switch freely from a browser, which has no terminal binding).
- Existing staff store assignments stay in the record for reporting and for unbound browsers.

## Technical notes

- `src/routes/api/public/sync.ts`: add an authenticated read operation (open shift by store, rules fetch), reusing the existing caller proof.
- `src/lib/pos-db.ts` `loadActiveShift` and `src/lib/pos-store.tsx` `refreshActiveShift`: fall back to the relay read when there is no Supabase session, and stop clearing `dbShift` on a failed read — only an explicit "no open shift" answer clears it.
- `src/lib/pos-rules.tsx` / `pos-rules.functions.ts`: always go through `savePosRules` and surface its `error` text. New `supabase/sql/19_rules_grants.sql` re-grants execute on `pos_rules_get` / `pos_rules_save` to `authenticated, service_role`.
- New `src/components/pos/PermissionGate.tsx` plus a `requirePermission` toast helper, wired into `AppShell` route guards, `ShiftGuard` and action buttons; labels come from `PERMISSION_LABELS`.
- `src/lib/permissions.ts`: presets stay as they are for cashier/warehouse/supervisor/admin (covered by existing security tests); extend only if the audit in step 3 finds an unmapped action.
- `src/lib/terminal-tokens.ts` already stores a `locationId` on the activated terminal; `src/lib/pos-auth.tsx` and `src/components/pos/AppShell.tsx` derive the active branch from it first, and `canSwitchStores` becomes false whenever a terminal binding exists.
- Tests extended in `src/lib/__tests__/permissions.security.test.ts` and `route-guards.security.test.ts` to assert a bound terminal cannot switch branch.