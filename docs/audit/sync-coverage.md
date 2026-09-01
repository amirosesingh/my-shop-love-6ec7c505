# Sync coverage

Generated from the feature registry and the till's own sync lists —
do not edit by hand. Run `bun scripts/sync-coverage.cjs` after changing a
feature or the sync contract.

| Table | Kind | Intended | Pushed up | Pulled down | Restorable | Note |
| --- | --- | --- | --- | --- | --- | --- |
| activity_events | governance | push | yes | — | yes |  |
| audit_logs | governance | push | yes | — | — | Kept on the till, but not branch-scoped centrally. |
| booking_payments | financial | both | yes | yes | — |  |
| bookings | operational | both | yes | yes | — |  |
| coupon_campaigns | reference | cloud-only | — | — | — | Campaign setup is administered centrally. |
| coupon_events | financial | cloud-only | — | — | — | Loyalty ledger is authoritative centrally. |
| drawer_events | financial | push | yes | — | yes |  |
| held_orders | operational | push | yes | — | yes |  |
| issued_vouchers | financial | cloud-only | — | — | — | Loyalty ledger is authoritative centrally. |
| item_activity_logs | governance | push | yes | — | yes |  |
| members | operational | both | yes | yes | — |  |
| membership_tiers | reference | pull | yes | yes | — |  |
| payment_transactions | financial | push | yes | — | yes |  |
| product_barcodes | reference | pull | yes | yes | — |  |
| product_categories | reference | pull | yes | yes | — |  |
| products | reference | both | yes | yes | — |  |
| promotions | reference | pull | yes | yes | — |  |
| purchase_order_items | operational | push | yes | — | yes |  |
| purchase_orders | operational | push | yes | — | yes |  |
| sale_items | financial | push | yes | — | yes |  |
| sales | financial | push | yes | — | yes |  |
| shift_sessions | financial | push | yes | — | yes |  |
| shifts | financial | push | yes | — | yes |  |
| stock_adjustments | operational | push | yes | — | yes |  |
| stock_transfer_items | operational | both | yes | yes | — |  |
| stock_transfers | operational | both | yes | yes | — |  |
| suppliers | reference | pull | yes | yes | — |  |

## Gaps between intent and reality

- **booking_payments** — Needed after a rebuild, but is not restorable.
- **bookings** — Needed after a rebuild, but is not restorable.
- **stock_transfer_items** — Needed after a rebuild, but is not restorable.
- **stock_transfers** — Needed after a rebuild, but is not restorable.

## Undecided tables

None — every table a feature uses is either synced or central by design.
