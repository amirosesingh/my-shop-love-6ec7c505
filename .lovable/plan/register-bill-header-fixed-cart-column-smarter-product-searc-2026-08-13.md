# Register: bill header, fixed cart column, smarter product search, dynamic tax

## 1. Header fix — no more overlap

The centre column header becomes two clean rows:

- Row 1: left, a bold **Current Bill #B101-PC01-20260813-0042** badge (truncating, never clipped); right, the shift/cashier badge ("shift open" or "No shift open").
- Row 2: action buttons only — **Exchange** and **Clear**. "Add product" is removed from this row.

Grid columns with `minmax(0,1fr)_auto`, `min-w-0` + `truncate` on the text and `shrink-0` on the badges, so buttons can never sit on top of the title at any zoom level.

## 2. Bill number is reserved when the ticket starts

- A bill number is minted the moment a new ticket begins (first line added) and shown in the header.
- Holding the bill stores that exact number on the held record; the next new sale takes the following number.
- Resuming a held bill restores its original number, and checkout writes the sale under that same number rather than minting a new one.
- Clearing/voiding a ticket releases it, and the next sale gets a fresh number.

## 3. Centre column is a fixed width

The cart column is locked to a fixed 420px (`min-w-[420px] max-w-[420px]`) instead of growing with the window; only the app-wide zoom/scale setting changes its size. The product catalog column absorbs the remaining space.

## 4. Barcode input

- The camera scan button only renders on Android/iOS builds; it disappears on Web and on the Windows desktop app.
- The text field stays auto-focused for USB/Bluetooth scanners, placeholder "Scan or enter barcode…".

## 5. Unknown code opens a rebuilt Search & Add Product modal

Scanning or typing a code with no match opens the modal automatically with the code prefilled.

The modal is rebuilt as a split view:

- Filter tabs across the top: All items · Barcode/SKU · Item name · Category · Item code/serial.
- Left panel: matching products with thumbnail, name, barcode/SKU, product code, stock at this branch, unit price. One tap adds to the cart and closes the modal.
- Right panel: the unrecognised code highlighted, with **Create new product with this barcode** and **Link barcode to selected item** (the second enables once a result is selected and saves the code onto that product).

## 6. Tax follows settings only

- No hardcoded 5% anywhere in the bill summary.
- Tax off in settings → no tax row at all, on screen or on the receipt.
- Tax on → the row shows the configured rate, but stays hidden when the ticket has no taxable items (tax amount 0).

## Technical notes

- `src/routes/index.tsx`: new two-row header; reserved-bill-number state seeded from `nextBillNumber` in `src/lib/bill-number.ts`, persisted with the cart draft and passed through to `recordSale`.
- `src/lib/pos-store.tsx`: `recordSale` accepts an optional pre-issued `receiptNo` and only mints one when absent.
- `src/lib/held-orders.ts`: `HeldOrder` gains `billNo`.
- `src/components/pos/ScanBar.tsx`: camera button gated on `isNative()` only.
- New `src/components/pos/ProductSearchDialog.tsx` replaces the current `CatalogPanel`-in-a-dialog usage on the register; `CatalogPanel` stays as-is for the inline left column.
- Tax row rendering in the summary and in the receipt output becomes conditional; totals maths in `cartTotals` is unchanged.
- No schema or backend changes.