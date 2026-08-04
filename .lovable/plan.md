# Receipt margins + printable barcode

Two fixes for the printed slip: text clipped on the right edge, and the barcode not appearing.

## 1. Adjustable print margins

Today the slip width and page margin are hardcoded per paper size (80mm slip = 72mm body, 4mm margin), so a printer whose printable area is narrower than that clips the right-hand column (totals, prices).

- Add per-terminal margin settings to the receipt printer settings page: **Left margin**, **Right margin** (mm, 0-10) and **Slip width** (mm), stored with the other local printer preferences.
- Use them in the receipt stylesheet: `@page { margin: ... }` and the body width derive from those values instead of the fixed constants, with today's values as defaults.
- Apply to every printed document that uses the shared receipt shell (sale, gift, refund, X/Z report, booking, transfer, test receipt) so nothing else drifts.
- Thermal (ESC/POS) mode: derive the character column count from the configured slip width so wrapped lines match the paper, and add a left-indent equal to the left margin.

## 2. Barcode that actually prints

The barcode is drawn as thin `<div>` bars filled with a black background. Browsers and Windows print drivers drop background colours by default, so the bars come out blank while the text under them still prints.

- Re-render the barcode as an inline SVG (same technique as the QR code), which always prints, using a real Code 39 symbology so scanners can read it back.
- Keep the human-readable value under the bars, and keep the existing `showBarcode` toggle and gift-return code behaviour.
- Thermal (ESC/POS) mode: barcodes are currently lost entirely when the HTML is converted to text. Emit a native ESC/POS `GS k` Code 39 barcode command for the receipt number instead, so thermal slips carry a scannable barcode too.

## Technical notes

- `src/lib/pos-print.ts`: `paperCss`/`shell` take margin + width overrides; `barcodeSvg` rewritten as SVG Code 39.
- `src/lib/receipt-printer.ts`: new `marginLeft`, `marginRight`, `slipWidth` fields in `PrinterPrefs` with normalisation and defaults.
- `src/components/pos/ReceiptPrinterSettings.tsx`: new margin/width inputs plus help text; "Test receipt" stays the way to verify alignment.
- `src/lib/escpos.ts`: column count from slip width, left indent, and a `barcodeBytes` helper for `GS k`.
- Version bumps by one patch as usual.
