# Simplify the "Add products" table on stock requests & transfers

## What changes

1. **Fewer columns.** The picker table keeps only:
   - `Barcode`
   - `Item`
   - `Current branch` — stock on hand at the branch you are working in
   - `Available` — stock at the other branch (the one you request from / send to)

   The per-row quantity box and the `Add` button column are removed.

2. **Double-click to add.** Double-clicking anywhere on a row adds that item to the
   transfer list with quantity 1. The quantity is then edited in the basket on the
   right, where it already can be. Barcode scanning (type code + Enter) keeps working
   and still adds 1.

3. **Wider table.** The "Add products" panel gets a much wider column so the four
   columns fit without side-scrolling, and the barcode/name cells stop being clipped
   at a fixed narrow width (long names wrap/truncate at the real column width instead).

4. **Header wording.** The old `Branch` header (which showed a branch code plus a
   number) becomes the plain `Available` count for that other branch, and the old
   `Available` column is relabelled `Current branch`.

## Notes

- Rows keep a hover highlight and a hint that double-click adds the line, so the
  removed Add button is discoverable.
- Nothing about how transfers, requests or receiving are saved changes — this is
  presentation only.

## Technical detail

- `src/components/pos/ProductPicker.tsx`: drop the `qty` state, the qty `<Input>` cell
  and the Add-button cell; add `onDoubleClick={() => onPick(p, 1)}` on `<tr>`;
  rename headers to `Current branch` (stock at `storeId`) and `Available`
  (stock at `destinationStoreId`); relax the `max-w-[8rem]` / `max-w-[12rem]` caps;
  adjust the empty-state `colSpan`.
- `src/components/pos/TransferComposer.tsx`: widen the left grid track
  (`xl:grid-cols-[minmax(0,360px)_...]` → a wider track) so the picker has room.
- Same picker is used by `/requests`, `/transfers` and `/receiving`, so all three
  pick up the change.
