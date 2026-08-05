# Sticky ticket, list-view products, aligned register controls

## 1. The cart stays until it is cleared on purpose
Today the ticket lives only in page memory: refreshing the till, navigating to another page and back, or the app reloading after an update wipes the lines silently.

The open ticket (lines, bill discount, exchange reference, attached member, applied coupon) is saved as a draft the moment it changes and restored when the register mounts. It is only emptied by:
- **Clear** / **Void cart** (existing permission checks unchanged)
- completing a payment
- holding or booking the order

Draft rules:
- Scoped per store, so switching branches does not mix tickets.
- A restored draft revalidates its products against the current catalogue; lines whose product no longer exists are dropped with a notice.
- Windows/web keep the draft across restarts; the Android live-only build keeps it for the session only, so no business data is written to device storage.

## 2. Products show as a list, not tiles
The catalogue grid becomes a single-column list. Each row: product name on the left, stock hint underneath, price on the right, and the existing info button for cross-store stock. Rows stay full-width and tap-to-add, keep the out-of-shift disabled state, and remain touch-height under the POS scaling.

## 3. Aligned discount and search controls
- The scan-barcode input, the member-search input and their buttons all use one control height so the two halves of that row line up.
- The per-line **Add discount** button and the **Bill discount** button use the same size and right-edge alignment as each other, so the discount controls form one straight column instead of different widths.

## Technical notes
- `src/lib/cart-draft.ts` (new): typed load/save/clear of the register draft, keyed `pos.cart.draft.<storeId>`, using `sessionStorage` when `isLiveOnly()` and `localStorage` otherwise.
- `src/routes/index.tsx`: hydrate `lines`, `cartDiscount`, `cartDiscountType`, `exchangeRef`, `memberId`, `coupon` from the draft on mount; a `useEffect` writes on change; `resetCart()` also clears the draft. Normalise control heights on the scan/member row and the two discount buttons.
- `src/components/pos/CatalogPanel.tsx`: replace `grid grid-cols-2 … xl:grid-cols-3` with a vertical list layout; no prop or behaviour changes.
- No backend or schema changes.