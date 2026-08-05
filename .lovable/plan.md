# Standalone branches, payment accounts, service bookings

## 1. Branch isolation with toggles

Each branch (store) gets three independent switches in Locations settings, all
defaulting to today's shared behaviour:

- **Private stock** — stock levels for this branch are excluded from other
  branches' views and from the group dashboard totals.
- **Private catalogue** — products created at this branch stay local and are
  hidden from other branches.
- **Allow transfers** — when off, this branch cannot send or receive stock
  transfers, and it disappears from other branches' transfer destination lists.

Plus a master **Branch sync** control with two sub-toggles:

- *Sync inventory* — stock and product changes push to the central server.
- *Sync everything else* — sales, shifts, members, audit.

Every one of these switches opens a confirmation dialog naming the branch and
spelling out the consequence before it flips, and each change is written to the
audit log with the staff member who made it.

## 2. Suppliers on/off from the list

The suppliers table gets an inline active switch on every row, so a supplier can
be deactivated without opening the edit dialog. Inactive suppliers stop appearing
in purchase-order pickers but keep their history.

## 3. Region-based time

A **Time zone** setting (region list, e.g. Asia/Kuala_Lumpur) in system settings.
When set, all POS timestamps that are displayed or printed — receipts, shift open
and close, bookings, reports, live clock — are formatted in that zone instead of
the PC's own clock. Stored values remain absolute timestamps, so branches in
different zones stay comparable. Default is "Use this computer's time zone".

## 4. Payment accounts (card machines, bank accounts, e-wallets)

New admin-managed list: **Payment accounts**, each with a name, a type (card
machine / bank account / e-wallet / other), optional bank name and account
number, an active switch, and optional branch restriction.

At the till, when a tender is card, bank transfer or wallet, the cashier picks
the account from a dropdown of active accounts instead of typing a bank name
free-hand. The chosen account is saved on the sale, printed on the receipt, and
becomes a filter and grouping column in sales and payment reports so takings can
be reconciled per machine/account.

Existing free-typed bank names keep working for old sales.

## 5. Bookings: service type, service fee, pay now or on collection

- Admin-managed **Service types** list (name, default fee, active switch), with
  a toggle to also allow a free-text "other" type when nothing fits.
- Booking creation gains a service-type dropdown; picking one pre-fills the
  service fee, which the cashier can override. The fee is added as a line on the
  booking and appears on the slip and the final receipt.
- A payment-timing choice on the booking: **Pay now**, **Deposit**, or **Pay on
  collection**. Pay-on-collection bookings are created with zero paid and are
  clearly flagged in the bookings list and on the printed slip.
- Bookings list gains a service-type filter and shows the type as a badge.

## Technical notes

- Schema additions: store flags (`private_stock`, `private_catalogue`,
  `allow_transfers`, `sync_inventory`, `sync_other`), `payment_accounts` table,
  `booking_service_types` table, sale/tender `payment_account_id`, booking
  `service_type_id`, `service_fee`, `payment_timing`; plus grants, RLS and
  timezone/settings columns on `pos_settings`. Delivered as one migration and
  mirrored into `electron/db/schema.sql` for the local SQL Server.
- Sync gating is enforced in `src/lib/sync-outbox.ts` / `sync-engine.ts` by
  filtering queued operations against the active branch's flags, so switching
  sync off simply holds rows in the outbox rather than dropping them.
- Stock and catalogue visibility filters live in `src/lib/pos-store.tsx` and the
  all-shops dashboard, keyed off the branch flags.
- Time zone formatting goes through one shared helper used by print, reports and
  the live clock, rather than scattered `toLocaleString` calls.
- Confirmation dialogs reuse the existing dialog component; no new dependency.
