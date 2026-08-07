# Admin-only web login, and a hard "count the cash" gate on shift close

## 1. Cashier PIN login disappears from the browser

- The sign-in screen keeps both tabs (Cashier PIN / Supervisor · Admin) **only** when the app runs inside the Electron desktop shell or the Capacitor Android app.
- In a normal web browser the terminal shows a single email + password form for supervisors and admins. No PIN pad, no username box, no tab strip.
- Detection reuses what already exists: `isDesktop()` (Electron bridge) and `isNative()` (Capacitor). A small shared helper `isTerminalApp()` combines them so every future check agrees.
- The cashier sign-in call itself stays intact server-side — it is simply not reachable from the browser UI.

## 2. New rule: cash amount required before a shift can close

Added to **Settings → POS Rules → Shift & cash** as its own switch:

- **"Require counted cash before shift close"** (`require_counted_cash_on_close`, default on) — the drawer count must be typed in; an empty box is a hard block, re-checked on the server.

Today the box can be left empty and the close still goes through, because an empty field is read as the number 0. That treatment is removed: empty, blank or non-numeric means *no value*, not zero. A real 0.00 count is still accepted when the cashier actually types it.

## 3. Every close-shift path enforces it

- **Register (`src/routes/index.tsx`)** — Close Shift dialog: counted-cash field marked required with a red asterisk, inline error when blank or invalid, and the "Close shift" button stays disabled until a valid number is entered and no held bills block the close (the held-bill warning now disables, not just warns).
- **Shifts page (`src/routes/shifts.tsx`)** — the "Close & print Z" dialog currently has no gate at all: it closes with `0` on an empty box and never asks the server. It gets the same required field, disabled button, and the `assertShiftClosable` server check the register uses.
- **Server (`src/lib/pos-rules.functions.ts` / `pos-rules.server.ts`)** — `assertShiftClosable` checks the new rule key alongside the hold-bill rule and rejects a null/blank count with a clear message, so a modified browser cannot skip it.

## 4. Other required fields tightened in the same pass

Fields that already exist but accept blanks get the same treatment — red asterisk, inline message, submit disabled until filled:

- Open-shift opening float (register header, `ShiftGuard`, shifts page) — required whenever **Require opening float count** is on.
- Manual cash drawer open — typed reason required (rule-gated as today).
- Pay-in / pay-out reason — required when **Reason required for pay-in/pay-out** is on.
- Booking delete reason — already mandatory; brought onto the same shared pattern.

A small shared `RequiredField` wrapper handles the asterisk and error text so these all look and behave identically.

## Technical notes

- New rule column `require_counted_cash_on_close boolean not null default true` on `public.pos_store_settings`, mirrored into `supabase/sql/13_pos_rules.sql`, plus the key in `PosRules`, `DEFAULT_POS_RULES` and the rules-page group.
- The existing `require_daily_sales_for_shift_close` switch stays with its current meaning (declare daily sales); the new key is specifically the drawer count, so the two are managed separately.
- Parsing helper `parseAmount(value): number | null` — trims, rejects empty and `NaN`, otherwise returns the number. Used by both close dialogs and the server validator.
- Version bump to the next patch so desktop and APK feeds pick the change up.