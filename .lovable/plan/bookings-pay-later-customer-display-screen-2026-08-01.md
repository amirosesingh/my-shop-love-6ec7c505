# Bookings (Pay Later) + Customer Display Screen

## 1. Booking / Layaway at the register

A new "Book & Pay Later" action next to Checkout on the register.

- Cashier builds the cart as normal (discounts, promos, member all apply), then opens the Booking dialog.
- Dialog fields: deposit amount paid now (free entry), payment method for the deposit, collection/due date picker, optional note, customer (member lookup or walk-in name + phone).
- Balance due = bill total - deposit, shown live.
- On confirm: stock for every line is reserved immediately (held against the booking so it can't be sold), a booking reference is generated, and a Booking Slip prints.
- Bookings require an open shift, same as a sale.

## 2. Bookings screen

New sidebar entry under Sales listing bookings for the active store (all stores for admin/supervisor), with status filters:

- **Active** - within the payment window
- **Due soon / Overdue** - past the collection date, highlighted
- **Collected** / **Cancelled**

Per booking: view details, take an additional part payment, print a payment-received slip, **Collect** (settles the remaining balance, converts the booking into a normal sale + receipt, releases the reservation into a real stock movement), or **Cancel** (returns reserved stock; deposit handling recorded as a note).

## 3. Booking receipt formats

Added to the existing print engine so they inherit company name, fonts, header/footer, custom lines and QR settings:

- **Booking Slip** - items, total, deposit paid, balance due, collection date, "collect by" wording, plus the bank-transfer block.
- **Part Payment Slip** - amount received, running balance.
- **Final Collection Receipt** - a standard sale receipt referencing the booking number.

## 4. Bank transfer / payment details

New Settings tab "Payment Details": account name, bank name, account number, WhatsApp number. The WhatsApp number is rendered as a scannable QR (wa.me link) on the customer display and, optionally, on the booking slip so customers can pay the balance by transfer.

## 5. Customer-facing second screen

A `/display` route opened in a second browser window and dragged onto the customer monitor. A "Customer Display" button in the register header opens it.

Live-synced from the register in the same browser (BroadcastChannel, no backend round-trip), showing:

- Store/company name and a welcome state when the cart is empty
- Each line as it's scanned: name, qty, unit price, line discount
- Subtotal, total discount, tax, grand total in large type
- Member name, tier and points earned when a member is attached
- Amount tendered and change after payment
- Booking mode: deposit paid, balance due and collection date
- A "Pay by transfer" panel with the WhatsApp QR code, account name and account number

## Technical notes

- New `bookings`, `booking_items` and `booking_payments` tables (branch, member/walk-in details, deposit, balance, due date, status, cashier), staff-only under the existing `is_staff()` RLS pattern with matching GRANTs.
- Reservation tracked as a per-store reserved quantity so available-to-sell = stock - reserved; register stock checks and Inventory show the available figure.
- Payment details stored as new columns on `pos_settings`, following the existing branding-column pattern, with a matching idempotent SQL script for the live database.
- Booking types added to `src/lib/pos-types.ts`, persistence in `src/lib/pos-db.ts`, state actions in `src/lib/pos-store.tsx`, print templates in `src/lib/pos-print.ts`.
- Permission keys `can_create_booking`, `can_collect_booking`, `can_cancel_booking` added to the permission matrix and enforced in the UI; every booking action is written to the audit log.