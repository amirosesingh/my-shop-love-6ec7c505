# POS Rules Engine, Server-Side Enforcement and Register UI Fixes

## What you get

1. A new **POS Rules** settings page where an admin turns every operational rule on/off and sets its limits. Rules live in the database, not the browser.
2. Every terminal loads those rules from the backend after sign-in and re-loads them on refresh, so nothing can be faked from dev tools.
3. Blocked actions (over-limit discount, refund, void, drawer open, shift close with held bills) are re-checked on the server before anything is written.
4. Register layout fixes: "Add Discount" sits inline with Hold / Void / Pay instead of drifting to the right edge; "Hold Bill" only appears when the cart has items; "Held Bills" only appears when holds exist, with a live count badge.

## Rules included

- **Shift & cash**: block shift close on held bills, require daily sales + closing count, require opening float count, blind cash count, max drawer cash limit (safe-drop prompt), reason required for pay-in/pay-out, allow multiple shifts per terminal.
- **Discount & pricing**: max cashier discount %, max flat cart discount, discount stacking, reason for price override, prevent below-cost sale, tax exemption approval.
- **Inventory & refunds**: prevent negative-stock sale, require receipt for refund, manager PIN for refund, max refund days, track item voids (manager PIN after 3).
- **Terminal security**: auto-lock timeout, manager PIN for manual drawer open, manager PIN audit log.

## Technical approach

### Database
- New table `public.pos_store_settings`: one row per store (`store_id` text, nullable for the global default) with every rule as a typed column, plus `created_at` / `updated_at` and the updated-at trigger.
- Grants: `SELECT` to `authenticated`, `ALL` to `service_role`; RLS on. Read policy `is_staff(auth.uid())`, write policy `is_app_supervisor()`.
- Seed a global default row with the defaults from the spec.
- New `manager_override_events` table (action, rule key, requesting user, approving manager, store, terminal, payload summary, timestamp) — insert-only for staff, no update/delete. Backs `enable_manager_pin_audit_log`.
- SQL also mirrored into a new feature file `supabase/sql/13_pos_rules.sql` to match the existing per-feature layout.

### Server functions (`createServerFn`, authenticated)
- `src/lib/pos-rules.functions.ts`
  - `getPosRules({ storeId })` — returns the effective merged rule set (store row over global row over hard defaults).
  - `savePosRules({ storeId, patch })` — supervisor-only write.
  - `verifyManagerPin({ userId, pin, action, ruleKey, context })` — verifies through the existing `verify_terminal_pin` / `verify_cashier_pin` path, confirms the account is admin/manager, writes the override audit row, returns a short-lived signed grant token. The PIN is never compared client-side.
  - `assertShiftClosable({ shiftId, storeId, countedCash, salesDeclared })` — re-checks held-bill count and closing-count rules against the database, throws a structured error code.
  - `assertSaleAllowed({ storeId, lines, discounts, grantToken })` — re-checks discount ceilings, below-cost, stacking, negative stock and tax exemption before the sale is committed.
- Server-only helpers in `src/lib/pos-rules.server.ts`; grant-token signing keyed off a new secret.

### Client
- `src/lib/pos-rules.tsx`: `PosRulesProvider` + `usePosRules()`. Fetches through TanStack Query after auth, refetches on sign-in and window focus. **No `localStorage` persistence for rules** — a refresh refetches; while loading the UI treats rules as "most restrictive".
- Existing `localStorage` mirrors for review thresholds / manager limits are removed from the rule path (unrelated UI preferences such as theme stay as they are).
- `ManagerOverrideDialog` component: collects manager ID + PIN, calls `verifyManagerPin`, and hands the returned grant token to the action that triggered it.
- Wiring: discount pad, price override, cart line void, refund/return in `receipts.tsx`, drawer open, and `ShiftGuard` / shift close all gate on rules, show a toast with the reason when blocked, and open the override dialog when the rule allows manager approval.
- Auto-lock: idle timer driven by `auto_lock_timeout_seconds` calls the existing `lock()` in `pos-auth`.

### New settings page
- `src/routes/settings.rules.tsx`, added to the settings hub, grouped into the four categories with switches and number inputs, supervisor-only, saving through `savePosRules`. Per-store override toggle with "inherit global" behaviour.

### Register UI (`src/routes/index.tsx`)
- Action row rebuilt as a single grid/flex track with consistent gaps so Add Discount, Hold, Void and Pay stay inline and clamp inside the cart panel at every width.
- `Hold Bill` rendered only when the cart has items; `Held Bills` rendered only when the held-order count is above zero, with a numeric badge from the held-orders query.

## Notes

- Offline/Electron terminals keep working: when the cloud is unreachable the last server-fetched rule set is held **in memory only** for that session, and privileged overrides queue as pending until the server can re-validate them. Nothing security-relevant is written to disk.