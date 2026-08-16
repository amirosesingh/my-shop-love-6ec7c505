# Dynamic payments, checkout safety, canvas fixes & booking refactor

## What I found in the audit

- **Payments are hard-coded.** `PaymentMethod` in `src/lib/pos-types.ts` is a fixed union (`cash | card | wallet | points | bank_transfer`), used by the register, the split-tender editor and reports. There is no table or settings screen for payment types; `/settings/payment` only holds bank-transfer details and the payment QR.
- **Checkout safety is already mostly correct.** `completeSale` awaits `recordSale` → `db.commitSale`, which throws when nothing was stored; drawer opening and printing happen only after that resolves. Remaining gap: the reserved bill number is consumed on a failed attempt in some paths, and the voucher/coupon flow has no reference capture.
- **Canvas font size only works on some tiles.** `useAutoScale` bails out unless the node is a "bare" node, so the font-size buttons do nothing for panel nodes (cart, catalog, totals, etc.).
- **Display mode is partly wired.** `ActionButton` reads `style` from node options, but `CustomActionButton` forces stacked layout and always renders an icon container, so "text only" leaves a gap and "icon only" is not centred. Newly-created custom buttons also never receive the display mode chosen in the create dialog on later edits.
- **Bookings** are created inside the register dialog (`src/routes/index.tsx`), with a sparse 3-column racket layout, a free-text service fee field and no cart-style deposit breakdown or T&C acceptance for general bookings. The management list (`/bookings`) mixes racket and general bookings in one list and already blocks "collected" when a balance is due.

## Plan

### 1. Dynamic payment methods
- New `payment_types` table (`id`, `name`, `type_code`, `requires_reference`, `is_active`, `icon`, `sort_order`) with grants, RLS (staff read, supervisor write) and a seed of Cash, Card, Wallet, Points, Bank transfer and Government Voucher.
- New settings page `/settings/payment-methods`: list, add, edit, reorder, enable/disable and delete payment types, with a warning that disabling keeps historical sales intact.
- Load active types into the POS store on boot (cached for offline/native), and drive the register method buttons and the split-tender selector from that list instead of the hard-coded union. Labels for historical sales fall back to the stored `method` string so old reports never break.

### 2. Government voucher / coupon tender
- Any type with `requires_reference` prompts a modal at charge time: "Voucher / coupon serial number & reference details", mandatory before the sale can complete.
- The reference is stored on the tender and written to `payment_transactions.reference` plus `metadata` (serial, entered-by, captured-at), and is included in the offline queue so a network drop never blocks the sale.

### 3. Canvas / layout editor fixes
- Apply the font scale to every node, not just bare ones: publish `--node-font` / `--node-icon` for panel nodes too and have panel content inherit it, so the size buttons re-render instantly.
- Fix the display-mode switch end to end: `CustomActionButton` respects `both` / `text` / `icon` (no icon slot in text-only, centred icon and no label box in icon-only), and the inspector's display choice is persisted per node and applied live.

### 4. Checkout lifecycle
- Keep drawer + print strictly after a confirmed write; on failure show a clear toast, keep the cart and the reserved bill number intact so the same number is reused on retry, and never print or open the drawer.

### 5. Booking refactor
- General bookings: service fee defaults to 0, cart-style line items with an explicit deposit / balance breakdown, and a configurable Terms & Conditions block (from booking rules) with a mandatory acceptance tick.
- Racket service: collapse the 3-column intake into one vertical flow — Scan barcode → Customer & racket specs → Service items → Deposit → Terms.
- `/bookings`: split into two tabs, **Racket service** and **General**, each with its own columns; keep the existing rule that a booking cannot be marked collected while a balance is due.

## Technical notes
- Migration file: `supabase/migrations/20260816180000_dynamic_payment_types.sql` (table, grants, RLS, seed), mirrored into `supabase/online_schema_fix_latest.sql`.
- `PaymentMethod` becomes a `string` code with the current union kept as well-known constants, so existing validation (`validateTenders`, card bank requirement) keeps working and reports stay stable.
- Files touched: `src/lib/pos-types.ts`, `src/lib/pos-db.ts`, `src/lib/payment-types.ts` (new), `src/routes/settings.payment-methods.tsx` (new), `src/routes/index.tsx`, `src/components/pos/TenderSplit.tsx`, `src/components/pos/layout/RegisterWorkspace.tsx`, `src/components/pos/layout/CustomActionButton.tsx`, `src/routes/bookings.tsx`.
