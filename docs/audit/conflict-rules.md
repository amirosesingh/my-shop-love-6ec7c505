# Conflict rules

What happens when the same record is changed centrally and at a till.
Generated from the feature registry — do not edit by hand. Run
`bun scripts/sync-coverage.cjs` after changing a feature.

| Table | Rule | What that means |
| --- | --- | --- |
| activity_events | append-only | Nothing is overwritten — each entry is kept in its own right. |
| audit_logs | append-only | Nothing is overwritten — each entry is kept in its own right. |
| booking_payments | append-only | Nothing is overwritten — each entry is kept in its own right. |
| bookings | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| coupon_campaigns | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| coupon_events | immutable | Written once and never changed; a correction is a new record. |
| drawer_events | immutable | Written once and never changed; a correction is a new record. |
| entity_status_history | append-only | Nothing is overwritten — each entry is kept in its own right. |
| held_orders | till-wins | The till wins while it holds the record; head office accepts what it sends. |
| issued_vouchers | immutable | Written once and never changed; a correction is a new record. |
| item_activity_logs | append-only | Nothing is overwritten — each entry is kept in its own right. |
| members | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| membership_tiers | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| payment_transactions | immutable | Written once and never changed; a correction is a new record. |
| product_barcodes | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| product_categories | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| products | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| promotions | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| purchase_order_items | immutable | Written once and never changed; a correction is a new record. |
| purchase_orders | immutable | Written once and never changed; a correction is a new record. |
| sale_items | immutable | Written once and never changed; a correction is a new record. |
| sales | immutable | Written once and never changed; a correction is a new record. |
| shift_sessions | immutable | Written once and never changed; a correction is a new record. |
| shifts | immutable | Written once and never changed; a correction is a new record. |
| stock_adjustments | append-only | Nothing is overwritten — each entry is kept in its own right. |
| stock_transfer_items | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| stock_transfers | cloud-wins | Head office wins. The till replaces its copy on the next pull. |
| suppliers | cloud-wins | Head office wins. The till replaces its copy on the next pull. |

## Deletions

Reference records (products, categories, barcodes, units, suppliers,
promotions, membership tiers, locations, members) are never erased
centrally: they are stamped with a deletion time. The stamp travels down
the next sync and the till removes its own copy. Where local history still
points at the record — a product on a past bill — the stamped row stays put
and simply reads as gone. Transactional history is never deleted at all.
