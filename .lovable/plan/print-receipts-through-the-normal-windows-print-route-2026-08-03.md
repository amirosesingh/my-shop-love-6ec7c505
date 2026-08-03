# Print receipts through the normal Windows print route

## What you are seeing

On the desktop till every slip currently goes out as raw ESC/POS bytes through
the same channel that kicks the cash drawer. That is why the drawer reacts and
no receipt appears: the printer is handed control bytes on a path it is not
treating as a document, and nothing ever reaches the Windows printer driver, so
no page is rendered.

## The fix

1. **Print through the Windows driver like a normal document.**
   Receipts, X/Z reports and all other documents are rendered in a real window
   and handed to the selected Windows printer as an ordinary print job — the
   same route a browser uses. This is the path your printer already understands.

2. **Add a "Windows print dialog" option and make it the default on desktop.**
   Receipt print mode becomes three choices:
   - *Windows dialog (normal)* — the standard print window opens, you pick the
     printer and press Print. New default.
   - *Direct to printer (no dialog)* — same driver rendering, sent straight to
     the configured printer with no dialog, for fast till use once printing is
     confirmed working.
   - *Thermal text (ESC/POS)* — the raw route, kept as an option, no longer the
     default.

3. **Keep the drawer on its own channel.** The drawer pulse continues to use the
   raw write and is never mixed into a receipt job again.

4. **Test receipt honours the chosen mode** and reports the exact Windows error
   when a job fails, instead of failing quietly.

5. Bump the app version one patch step so the desktop update feed picks it up.

## Technical notes

- `src/lib/pos-print.ts` — `printHtml` routing rewritten: `dialog` mode →
  visible print dialog, `direct` → `silentPrint`, `thermal` → existing ESC/POS
  path; browser behaviour unchanged.
- `electron/main.cjs` — `print:silent` gains a `dialog` flag; when set, the
  render window prints with `silent: false` so Windows shows its print dialog,
  and the window stays alive until the callback returns.
- `electron/preload.cjs` — pass the new option through the bridge.
- `src/lib/receipt-printer.ts` — `printMode` becomes
  `"dialog" | "direct" | "thermal"`, defaulting to `dialog`; stored `graphics`
  values map to `direct`.
- `src/components/pos/ReceiptPrinterSettings.tsx` — three-way mode selector with
  updated help text.
- No database or backend changes.