# Space-aware buttons everywhere + discount pad polish

## What I checked (current state)

- `ActionButton` (icon + label, container-query collapse, tooltip + `aria-label`) already exists and is used in **two files only**: `src/routes/index.tsx` and `src/routes/bookings.tsx`. Inventory, purchasing, transfers, receipts, the catalog panel header and the settings frames still use plain buttons in rows that wrap and overlap in narrow windows.
- The cart already shows a per-line **Add discount** button gated by `can_give_discount` / manager override, and a **Bill discount** row above the totals. Both open `DiscountPad`.
- `DiscountPad` already has 5-step presets to 50, a percent/amount switch, a keypad for custom entry, and **Clear**. What it does **not** have is a live preview of the resulting price.

So item 2 is largely in place; the work there is the preview plus labelling. Item 1 is a real rollout.

## 1. One button language across the app

- Keep `ActionButton` as the single primitive for page and toolbar actions; add a compact affordance so dense table rows can force icon-only.
- Convert the action rows in:
  - `src/routes/inventory.tsx`, `src/routes/purchasing.tsx`, `src/routes/transfers.tsx`, `src/routes/receipts.tsx`
  - `src/components/pos/CatalogPanel.tsx` header (Open/Close shift, Customer screen, Racket booking)
  - `src/components/pos/settings/SettingsFrame.tsx` header actions
  - the register action bar and cart rows in `src/routes/index.tsx` that still use raw buttons
- Every converted control gets an icon and a full label; the label collapses to icon-only below the breakpoint and stays available as tooltip and `aria-label`.
- Apply the responsive header rule to each of those headers: `grid grid-cols-[minmax(0,1fr)_auto]` on mobile promoting to `flex` at `sm:`, `min-w-0` on the text column, `shrink-0` on icons and button groups, `truncate` on titles — so a long product, member or supplier name shrinks instead of pushing neighbours out of frame.

## 2. Discount pad refinements

- Add a **live preview** to `DiscountPad`: it receives the base amount (line total or ticket subtotal) and shows "was X, now Y (−Z)" as the entry changes, with a warning when the discount would drive the value below zero.
- Label the keypad entry explicitly as **Custom %** or **Custom amount** following the mode switch, so the two custom paths read clearly next to the presets.
- Keep everything else unchanged: permission gate (`can_give_discount` plus manager override), the rule checks against `max_cashier_discount_percent` / `max_cart_discount_amount` / `allow_discount_stacking`, and the existing audit-trail writes on apply and clear.

## Technical notes

- `src/components/pos/ActionButton.tsx`: optional compact prop; no change to the tooltip/long-press behaviour.
- `src/components/pos/DiscountPad.tsx`: new optional `baseAmount` prop driving the preview; callers in `src/routes/index.tsx` pass the line total or subtotal.
- Page toolbars refactored in place; no state, store or backend changes, no schema migration.