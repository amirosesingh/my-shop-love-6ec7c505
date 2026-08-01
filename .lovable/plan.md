# WhatsApp bills, bank-transfer payments, and a human-readable activity log

## 1. WhatsApp bill sending (Meta Cloud API)

New Settings tab "WhatsApp":

- Master on/off switch. Everything below is hidden when off.
- Message format selector: **Text receipt** (full itemised bill in the message) or **Text + link** (short summary plus a link to a web page showing the bill).
- Business phone number ID and template name fields (the access token is stored as a secret, never shown in the UI).
- Auto-send toggle: send automatically after every completed sale, or only when the cashier presses "Send on WhatsApp".
- "Send test message" button to a number you type in.

At the register and in Receipts history, a **Send on WhatsApp** button appears next to Print whenever the feature is on. It uses the member's phone, or asks for a number for walk-ins. The result (sent, or failed with the reason from Meta) is shown as a toast and written to the activity log.

For "Text + link", a public bill page at `/bill/<token>` renders a read-only receipt from a random unguessable token, so no customer data is browsable.

Sending happens on the server so the access token never reaches the browser. You'll be asked for the Meta access token once, after the setup screen exists.

## 2. Bank transfer as a real payment method

- "Bank transfer" is added alongside Cash / Card / Wallet / Points at checkout and on booking part-payments, with an optional reference field for the transfer slip number.
- Receipts, shift/Z reports and sales history show it as its own tender line so cash counts stay accurate.
- Choosing it flips the customer display into a **transfer instructions** state showing bank name, account name, account number, the amount to pay, and the QR code for the WhatsApp number so the customer can scan and send their transfer slip. These come from the existing Settings → Bank transfer tab.
- The customer display also gains the full bill detail you asked for: every line with qty, unit price and line discount, each promotion applied, subtotal, total discount, tax, grand total, member and points, then tendered/change or balance due.

## 3. Human-readable activity log for every role

- **Categories become action types, not button names**: Sales & Payments, Refunds & Exchanges, Bookings, Cash Drawer & Shifts, Inventory, Purchasing & Receiving, Members & Points, Staff & Permissions, Settings, Navigation, Data Export, Sync. Filters, badges and CSV export all use these labels.
- Every logged event gets a plain-English sentence (for example "Priya opened the discount dialog on the register", "Admin changed Ali's role from Cashier to Supervisor"), including generic clicks and dialogs, which are described by what they do rather than by raw button text.
- Coverage is extended so admin and supervisor actions are logged in the same detail as cashiers: role changes, permission toggles, settings edits, store switching, staff creation, price edits, booking collection and cancellation, and WhatsApp sends.
- Log rows show the person's role next to their name, and a role filter is added beside the existing staff filter.

## Technical notes

- `WHATSAPP_ACCESS_TOKEN` stored as a project secret; a `sendWhatsAppBill` server function calls `graph.facebook.com/v21.0/<phone_number_id>/messages` and surfaces Meta's error body verbatim on failure.
- New `whatsapp` JSONB column on `pos_settings` (enabled, format, phoneNumberId, templateName, autoSend) plus a `whatsapp_sends` log table with staff-only RLS and GRANTs; a `bill_token` column on `sales` backs the public bill link.
- `PaymentMethod` in `src/lib/pos-types.ts` gains `"bank_transfer"` with a `transferRef` on the sale; the change flows through `pos-store.tsx`, `pos-print.ts`, shift/Z-report totals and `pos-db.ts`.
- `DisplaySnapshot` in `src/lib/customer-display.ts` gains promo lines and a `transfer` mode; `src/routes/display.tsx` renders the new states.
- The `AuditCategory` union in `src/lib/audit-log.ts` is remapped to the new action types with a migration for already-stored logs; `src/lib/audit-format.ts` gains sentence templates plus a generic fallback that phrases unknown events as actions.