# v1.1.5 — Phone pairing, cancelled bills back to hold, mobile button icons

## 1. Pair a PC terminal by scanning it from your phone

Today the PC activation screen only accepts a pasted or scanned admin code. Add the reverse direction:

- The PC activation screen shows its own **pairing QR** (device name, machine fingerprint, a short-lived pairing id). No typing, no copying.
- On the phone (Android admin), the terminals page gets a **"Scan a PC to pair"** button that opens the camera. Scanning the PC's QR opens the issue-token sheet pre-filled with that device name; you pick the location and approve.
- The PC screen polls for its pairing request being approved and activates itself automatically — the cashier never touches the keyboard.
- Manual paste stays as the fallback.

## 2. Phone registers first, and manages only PC terminals

- The Android app already hits the activation gate before the till; it stays.
- The terminals list on the phone **hides the phone's own terminal** and shows only PC/desktop terminals, so you can issue, re-issue, revoke and delete PC tokens from the phone without being able to cut yourself off.

## 3. A cancelled bill returns to Hold

When a bill is cancelled in Receipt history, its items are put back on the register as a **held order** ("Cancelled BILL-123"), ready to resume, correct and ring up again. Stock still returns and the cancellation is still audited exactly as today. Held orders move into shared storage so the receipts page can create one and the register can resume it.

## 4. Phone UI: every button carries an icon

- All remaining text-only buttons on the register, cart, payment dialog, receipts and settings actions get an icon and route through the adaptive button, so on a phone they collapse to icon-only and a **long press (or hover on desktop) reveals what they do**.
- Specifically **Add discount** on the cart line and the bill gets a percent icon, and opens the calculator pad as before.
- Tap targets raised to a comfortable minimum on small screens so nothing overlaps.

## 5. Version

Bump to **1.1.5** in `src/version.ts` and `package.json`.

## Technical notes

- `src/lib/terminal-tokens.ts`: `createPairingRequest()` / `readPairingRequest()` / `approvePairing()` built on the existing `terminal_tokens` row plus `claimed_by_device` + `claimed_at`; a `pending` status row is created by the admin approval and claimed by the PC via the existing `terminal_token_claim` RPC. Polling reuses `terminal_token_status`.
- `src/components/pos/TerminalActivation.tsx`: renders the pairing QR with `qrcode-generator` (already a dependency) and polls every 3s while visible.
- `src/components/pos/TerminalTokens.tsx`: "Scan a PC to pair" using the existing `CameraScanner`; filter out the row whose `id` equals this device's own `tokenId`.
- New `src/lib/held-orders.ts`: shared held-order list (in-memory + localStorage, skipped on Android live-mode) with a subscribe hook; `src/routes/index.tsx` reads/writes it instead of local `useState`, `src/routes/receipts.tsx` pushes the cancelled bill's lines into it.
- Icon pass over `src/routes/index.tsx`, `src/routes/receipts.tsx`, `src/components/pos/CartPanel`-side controls using `ActionButton` (long-press tooltip already implemented there).
- No database schema change required.
