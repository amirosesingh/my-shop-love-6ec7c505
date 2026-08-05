# Mobile-friendly controls, bill corrections, terminal registration

## What you'll get

**1. Every button explains itself**
- Register/toolbar buttons already collapse to icons on small screens; they'll gain a **long-press label** on touch (hold ~0.5s to see what a button does) alongside the desktop hover tooltip. Today the tooltip only appears on hover, so on a phone/tablet the icon-only buttons are unlabelled.

**2. Cancel a bill / fix the payment method after checkout**
- In **Receipt history**, the selected bill gains two actions:
  - **Cancel bill** — voids the sale, restocks the items, marks the receipt cancelled, and writes an audit entry with staff name and typed reason. Requires the refund permission (manager PIN prompt otherwise).
  - **Change payment method** — corrects a bill rung up as Card when it was Cash (and cash/card/wallet/transfer in general). Updates the stored bill in the database and logs the before/after value. Requires the tender-edit permission.
- Inside the payment dialog the method can already be switched before finishing, so this covers only the after-the-fact correction that is missing today.

**3. Discount pad on the cart**
- Adding a product surfaces a **Discount** action on the cart line and on the bill; tapping it opens a calculator-style pad with 5 / 10 / 15 / 20 / 25 … presets in steps of five, a percent-or-amount switch, and a custom keypad entry. The current build has plain percent/amount inputs and no preset pad.

**4. Terminal registration on Android**
- Android will hit the same **activation gate first** — the app cannot reach the till until the device is registered with a terminal token. That gate currently runs only in the desktop shell.
- The activation screen already supports camera scanning, so a phone activates by scanning rather than pasting.
- **Terminals admin on mobile**: the terminals page stays available on Android so you can issue, re-issue, revoke and delete PC terminal tokens from your phone; the device you are signed in on is marked "this device" and cannot revoke itself.
- **Pairing QR on the PC terminal**: the PC activation screen displays its own QR describing the device pairing request. Scanning it from the Android admin app opens the issue-token sheet pre-filled with that device; approving it activates the PC with no code typing or copying.

**5. Version**
- Bumped to **1.1.3** in `src/version.ts` and `package.json`, keeping the 1.1.x line for desktop, Android and web bundles.

## Technical notes

- `src/components/pos/ActionButton.tsx`: touch long-press state driving the tooltip; tooltip no longer hidden at `sm+`.
- `src/components/pos/DiscountPad.tsx` (new): preset grid + keypad, reused by cart line and bill discount in `src/routes/index.tsx`.
- `src/lib/pos-db.ts`: `updateSalePayment(saleId, method, bankName)` queued update on `sales.payment_type`; existing `refundSale` reused for cancellation.
- `src/lib/pos-store.tsx`: new `changeSalePayment` action; `refundSale` reused for cancel with an audit reason.
- `src/routes/receipts.tsx`: cancel / change-payment controls gated by `requirePermission("can_process_refund")` and `can_edit_tenders`.
- `src/components/pos/AppShell.tsx`: activation gate condition becomes `isDesktop() || isNative()`.
- `src/components/pos/TerminalActivation.tsx` + `TerminalTokens.tsx`: device pairing QR emitted by the terminal, consumed by the admin issue flow.
- No schema change needed — `terminal_tokens` already carries `claimed_by_device` / `claimed_at`, and `sales.payment_type` is updatable.