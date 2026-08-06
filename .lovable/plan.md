# Register: always-available product search and member fallback

## 1. Product search is always reachable
Today the "Add product" search popup only appears on narrow windows; on a wide till the only entry point is the barcode field, so a bad scan leaves the cashier stuck.

- Add a **Search** button next to the scan barcode input in the register (visible on every screen size), opening the existing "Search & add products" dialog.
- Keep the "Add product" button in the ticket header, but show it on all widths instead of only small screens.
- The dialog keeps its current behaviour: type name/SKU/barcode, filter by category, tap a row to add and close.

## 2. A failed scan opens the search automatically
When a scanned or typed code matches no product, instead of only showing an error toast:

- Show the toast ("No product matches ...") **and** open the product search dialog with the scanned code prefilled in its search box, so the cashier can find the item by name straight away.
- If the code partly matches products by name/SKU, those results are already listed by the existing filter.
- Same handling for a wrong scan that finds nothing; nothing changes when the scan succeeds.

## 3. Member not found leads somewhere
Today typing a phone number with no match just prints "No member matches ...".

- Under that message, show two buttons: **Search again** (clears the query and refocuses the input) and **Enroll new member**.
- **Enroll new member** opens a compact new-member dialog on the register with name, phone, email (optional) and tier, prefilled with the typed phone number (or name, if the text isn't numeric).
- Saving creates the member through the existing member save path and immediately attaches them to the current ticket, with the same voucher check that runs on a normal attach.
- Add a small **New member** button next to the member search input so it is reachable before searching too.

## Technical notes
- `src/routes/index.tsx`: reuse the existing `catalogOpen` dialog and `query` state; on a failed `scanCode` set `query` to the code and open the dialog. Drop the `lg:hidden` on the header Add product button and add a search button beside `ScanBar`.
- New `src/components/pos/QuickMemberDialog.tsx`: name/phone/email/tier form, saving via the same member upsert used by `src/routes/members.tsx`, returning the created member to the register for attachment.
- No schema or backend changes.
