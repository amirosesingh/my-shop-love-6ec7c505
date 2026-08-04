# Settings fix, live branch board, supplier purchasing and register shift controls

## 1. Fix "Could not find the 'day_end_time' column of 'pos_settings'"

The central (live) database the terminals write to is missing the trading-hours columns the app now saves. A new script `supabase/schema19.sql` adds them idempotently:

- `pos_settings`: `day_start_time`, `day_end_time`, `max_shift_hours`, `shift_reminder_minutes`
- plus the earlier additions in case they were never run: `products.landing_pct`, the `sku_audit` table

The settings writer also becomes tolerant: if the server rejects an unknown column, it retries without the optional fields instead of failing the whole save.

## 2. Live performance board for all shops (admin only)

`/all-shops` gets a live performance section, visible only to admins (hidden in the menu and blocked on direct navigation for everyone else):

- Per-branch cards: today's sales, transaction count, average basket, cash vs card split, shift open/closed and who is on the register.
- A live transactions table across every branch (time, branch, terminal, cashier, bill number, total, payment), auto-refreshing.
- Group totals on top, branches ranked by revenue.

## 3. Show/hide controls for Sales and Register POS

Admin-managed visibility, alongside the existing inventory column matrix, in Settings › Inventory, cost & drawer rules (renamed "Visibility & till rules"):

- Register: catalog panel, member panel, discount buttons, price override, hold/park, exchange, refund, manual drawer, cost/profit hints.
- Sales & bill history: cost/margin columns, void and refund buttons, reprint.

Each element toggles per role (cashier, supervisor, warehouse, manager). Admins always see everything.

## 4. Cashier PIN from the keyboard

The PIN screen also accepts typed digits: number keys append, Backspace deletes, Enter submits, and the 6th digit auto-submits as today. The on-screen pad stays for touch terminals.

## 5. Purchases via Excel + supplier management

- **Suppliers**: new `suppliers` table (name, contact person, phone, email, address, tax number, notes, active) with an admin page at `/suppliers` to add, edit and deactivate. Receiving picks a supplier from this list instead of free text; purchase orders store the supplier id (the existing name column stays for old records).
- **Excel import on receiving**: upload an `.xlsx`/`.csv` of purchased goods (barcode, name, cost, selling price, qty, supplier). Rows are previewed with matched/unmatched status, unknown barcodes can be created inline, then posted as one invoice with the same audit trail as scanning. Template download included.

## 6. Shift settings and close shift on the register

- Remove Settings › Trading hours & shifts (the max-shift-hours page) and its link; reminder/overdue logic keeps running off stored defaults.
- Add a **Close shift** button in the register header next to the open-shift banner, gated by the close-shift permission, opening the existing counted-cash dialog and closing the shift in the database with the operator recorded.

## Technical notes

- New `supabase/schema19.sql` to run once on the central database (columns above plus the `suppliers` table with grants and RLS).
- New files: `src/lib/suppliers.ts`, `src/routes/suppliers.tsx`, `src/lib/ui-visibility.ts`.
- Edited: `src/lib/pos-db.ts` (settings writer fallback, supplier + PO mapping), `src/routes/all-shops.tsx` (live board, admin gate), `src/components/pos/TerminalLogin.tsx` (keyboard PIN), `src/routes/purchasing.tsx` (supplier picker + Excel import via SheetJS), `src/routes/index.tsx` and `src/components/pos/ShiftGuard.tsx` (close-shift button, visibility gating), `src/routes/settings.index.tsx` and `src/routes/settings.inventory.tsx` (visibility matrix, hours link removed); delete `src/routes/settings.hours.tsx`.
- Version bump on release.