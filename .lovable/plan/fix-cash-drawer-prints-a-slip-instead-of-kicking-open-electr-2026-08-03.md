# Fix: cash drawer prints a slip instead of kicking open (Electron)

## What is happening

The drawer pulse is sent to Windows by copying a file to a printer **share**
(`copy /b file \\localhost\POS`). If the printer is not shared under that exact
name — the normal case for a USB/RJ-connected receipt printer — the copy fails.
The desktop shell then silently falls back to printing the escape sequence as a
tiny page, so a slip comes out and the drawer never opens. The same fallback
runs at the end of a sale, which is why sales behave the same way.

## The fix

1. **Send raw bytes straight to the printer, by name.**
   Replace the share-based copy with a Windows RAW spooler write (winspool
   `OpenPrinter` / `StartDocPrinter` with the `RAW` datatype, driven from a short
   PowerShell helper the desktop shell writes to a temp file). No share, no
   driver rendering — the pulse `ESC p 0 25 250` reaches the printer untouched
   and is forwarded to the RJ11 drawer port. The share copy stays only as a
   second attempt when a share name is explicitly configured.

2. **Stop the "print a slip" fallback in the desktop app.**
   If the raw write fails in Electron, report the error instead of printing the
   sequence as a page. Only the browser (no bridge available) keeps the old
   printed-slip behaviour.

3. **Surface failures.** Toast "Drawer did not open: <reason>" when the pulse
   fails, and log the reason to the desktop log file, instead of a mystery slip.

4. **Printer settings: Test drawer button.**
   A "Test drawer kick" button runs the same path and reports success or the
   exact Windows error. Add a pulse-pin option (standard pin 2, or pin 5
   `ESC p 1 25 250`) since some drawers are wired to the second pin and never
   respond to the default pulse.

5. Bump the app version one patch step so the desktop update feed picks it up.

## Technical notes

- `electron/main.cjs` — rewrite `printRaw`: primary = PowerShell RAW spooler
  write to `deviceName` (Windows default printer when blank), secondary = the
  existing share copy when a share is set; remove the `printSilent` fallback in
  the `print:raw` IPC handler and return the error instead.
- `src/lib/receipt-printer.ts` — `rawPulse` returns `{ handled, ok, error }` so
  callers can tell "no bridge" apart from "bridge failed".
- `src/lib/pos-print.ts` — `openCashDrawer` uses that result: browser → printed
  slip fallback; Electron failure → toast + log, no slip.
- `src/components/pos/ReceiptPrinterSettings.tsx` — test button plus pulse-pin
  option stored with the existing printer prefs.
- No database or backend changes.