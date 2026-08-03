# Fix: receipts reach the printer but nothing comes out (Electron)

## What is happening

Silent printing renders the receipt HTML in an **offscreen** Electron window and
calls `webContents.print({ silent: true })`. Offscreen windows have no real paint
surface, so the job is created and handed to the spooler — the printer reacts —
but the rendered page is empty or never rasterised. That matches exactly what you
see: the printer responds, no receipt.

The raw spooler path used for the cash drawer (`print:raw`, winspool RAW write)
is a separate, working route.

## The fix

1. **Stop printing from an offscreen window.**
   Render the receipt in a hidden but *real* `BrowserWindow` (`show: false`,
   no `offscreen`), wait for `ready-to-show` plus a paint tick, then print with an
   explicit `pageSize` derived from the configured paper (80mm / 58mm / A4 /
   Letter) and zero margins. Destroy it after the callback.

2. **Add a true ESC/POS text mode for thermal slips (default on desktop).**
   Receipts and X/Z reports are converted to ESC/POS bytes (init, alignment,
   double-height title, 42/32-column body, cut) and pushed through the same RAW
   spooler write that already drives the drawer. No driver, no rendering, so a
   thermal printer prints instantly and correctly.
   Full-page documents (A4/Letter reports, member statements, transfer notes)
   keep the HTML route.

3. **Print mode setting.**
   Receipt printer settings gains "Receipt print mode": *Thermal text
   (recommended)* or *Graphics / driver*, plus a **Test receipt** button that
   prints a short sample through the selected route and reports the exact
   Windows error on failure.

4. **Real failure reporting.** If a desktop print fails, toast "Printing failed:
   <reason>" and log it, instead of silently doing nothing.

5. Bump the app version one patch step so the update feed picks it up.

## Technical notes

- `electron/main.cjs` — rewrite `printSilent` (no `offscreen`, `ready-to-show`
  gate, `pageSize` from an options field, keep `deviceName`); reuse the existing
  `printRaw` for text receipts.
- `src/lib/escpos.ts` (new) — text/ESC-POS renderer: column layout, alignment,
  bold/double-height title, barcode-free plain text, `GS V` cut.
- `src/lib/pos-print.ts` — `printHtml` gains a document kind; slip-sized
  documents go through ESC/POS when the mode is thermal and the bridge exists,
  otherwise the HTML route, otherwise the browser iframe.
- `src/lib/receipt-printer.ts` — carry `printMode` in the stored prefs, pass
  paper size to `bridge.print`.
- `src/components/pos/ReceiptPrinterSettings.tsx` — mode selector + test receipt.
- No database or backend changes.
