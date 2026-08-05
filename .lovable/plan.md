# Register layout cleanup: shift button, cart header, payment card

## 1. Remove the "Payment execution" box
The card in the right-hand action column with Cash / Card / Digital pay and the "Due" line is removed from the register. Payment is still taken from the main "Take payment" button under the totals, and split bill is unchanged.

## 2. Shift button lives with the shift status
Today the cart header shows "Current ticket / No shift open" on the left and a row of buttons on the right that crowd and visually sit over that text on narrow windows.

- The header becomes a two-column layout: the text column can shrink and truncate, the button column never overlaps it.
- The shift control sits next to the shift status line: it reads **Open shift** when no shift is running and switches to **Close shift** once a shift is open (same permission checks and dialogs as today).
- The cart row keeps only "Add product" (narrow windows), "Exchange" and "Clear" — the separate Close shift button in that row goes away, since the shift toggle now covers it.

## 3. Product panel buttons to the left
In the products/catalog panel, "Customer screen" and "Open shift" currently sit hard right. Both move to the left of that row.

## Technical notes
- `src/routes/index.tsx`: delete the `register.paymentExecution` card block; restructure the cart header into `grid grid-cols-[minmax(0,1fr)_auto] gap-3` with `min-w-0` on the text side; render a single shift button beside the "Current ticket" text driven by `activeShift`, gated by the existing open/close shift permissions.
- `src/components/pos/CatalogPanel.tsx`: header actions row changes from `justify-end` to left alignment.
- No backend or state changes.