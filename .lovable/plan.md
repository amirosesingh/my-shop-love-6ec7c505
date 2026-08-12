# X-Report control, Z-Report close screen options, and a strict "no count = no print" lock

## Audit summary (what exists today)

- **Rules engine**: `pos_store_settings` (one global row plus per-branch rows) is the single source of POS rules, read through `pos_rules_get` and edited in Settings → POS Rules (`src/routes/settings.rules.tsx`, groups defined in `src/lib/pos-rules.ts`). The server re-validates closes in `assertShiftClosable` (`src/lib/pos-rules.functions.ts`).
- **X-Report**: one entry point only — the "Print X report" button on the Shifts page (`src/routes/shifts.tsx`), generated from live sales by `printShiftReport(..., "xreport")` in `src/lib/pos-print.ts`. There are currently no edit fields, override inputs or adjust buttons on the X-Report path, so immutability is about locking it in place rather than removing controls.
- **Z-Report / close shift**: three separate close dialogs — register header (`src/routes/index.tsx`), Shifts page (`src/routes/shifts.tsx`) and the shift banner (`src/components/pos/ShiftGuard.tsx`). Each shows the expected drawer figure, asks for counted cash, then closes and prints. Opening float already lives on the shift record and is not re-typed at close.
- **Printing**: `printHtml` and `openCashDrawer` in `src/lib/pos-print.ts` already branch per platform — Electron silent printing and a raw ESC/POS drawer pulse through the preload bridge (`electron/preload.cjs`), with browser/Android falling back to an HTML print window. No new driver work is needed; the change is *when* those calls are allowed to fire.

## What will change

### 1. X-Report access toggle

- New rule `enable_cashier_x_report` (default **off**), shown in Settings → POS Rules under "Shift & cash".
- Off: the "Print X report" button is hidden from anyone who is not a supervisor/admin, and the report path rejects non-supervisor callers server-side, so a modified client cannot pull the snapshot either.
- On: cashiers can view and print the mid-shift snapshot as today.

### 2. X-Report immutability

- The X-Report stays purely derived from recorded sales and the shift record — no writable field or override control on any platform.
- A "System-generated snapshot — cannot be edited" line is printed on the slip, and every print is written to the immutable audit trail (`X_REPORT_PRINTED`, with who, terminal and shift).

### 3. Closing-screen visibility toggles

A new "Shift close screen" group in Settings → POS Rules:

- `show_opening_float_at_close` (default on)
- `show_expected_totals_at_close` (default off)
- `show_live_variance_at_close` (default off)
- `show_itemized_tender_breakdown` (default on)
- `require_manager_pin_on_variance` (default on) with `variance_pin_threshold` (default 10.00)

All three close dialogs read the same toggles, so the closing screen looks identical wherever it is opened. The existing blind-count rule keeps working: expected and variance stay hidden when either the blind rule is on or the matching toggle is off.

### 4. Derived close maths

- Opening float is read from the active shift and shown read-only (only when its toggle allows) — never an input.
- The cashier types the total cash in the drawer; the screen derives `cash sales = counted − opening float`, and the variance against expected cash.
- When `require_manager_pin_on_variance` is on and the absolute variance exceeds the threshold, the close is gated behind the existing manager-PIN dialog before it proceeds.

### 5. Strict print lock

- Cancelling, dismissing, or leaving the count blank leaves the shift **OPEN**, sends no print job and no drawer pulse on any platform, and records `SHIFT_CLOSE_CANCELLED` in the audit trail.
- Z-Report printing and the drawer kick fire only after the server accepts the close and the shift row is updated, so a failed update can never leave a printed Z against an open shift.

## Technical notes

- Migration adds the six columns to `public.pos_store_settings` with `ADD COLUMN IF NOT EXISTS`, mirrored into `supabase/sql/13_pos_rules.sql` and into the `pos_rules_get` / `pos_rules_save` column lists.
- `PosRules`, `DEFAULT_POS_RULES` and `RULE_GROUPS` in `src/lib/pos-rules.ts` gain the same keys; `normalizeRules` needs no change.
- `assertShiftClosable` gains the variance check, reusing the existing signed override grant for action `shift_close`.
- A shared `useCloseShiftForm` helper gives `index.tsx`, `shifts.tsx` and `ShiftGuard.tsx` one copy of the derived maths, visibility flags and print-lock ordering.
- New server-side guard for X-Report access, plus audit entries through the existing `logSystemAction`.
- Version bump to the next patch so desktop and APK feeds pick the change up.