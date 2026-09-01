# Recovery after a wipe

If a till's database is deleted, what does a replacement get back? Worked
out from the feature registry and the till's own sync lists — do not edit
by hand. Run `bun scripts/sync-coverage.cjs` after changing a feature.

11 of 11 features rebuild completely.

| Feature | Verdict | Comes back | Would be lost | Central by design |
| --- | --- | --- | --- | --- |
| Direct sales & checkout | Rebuilds completely | sales, sale_items, payment_transactions, item_activity_logs | — | — |
| Stock transfers & adjustments | Rebuilds completely | stock_transfers, stock_transfer_items, stock_adjustments, products | — | — |
| Table & venue bookings | Rebuilds completely | bookings, booking_payments | — | — |
| Ticket & event bookings | Rebuilds completely | bookings | — | coupon_campaigns, issued_vouchers |
| Customers & membership sync | Rebuilds completely | members, membership_tiers | — | issued_vouchers |
| Inventory & item activity | Rebuilds completely | products, product_barcodes, product_categories, item_activity_logs | — | — |
| Purchasing & suppliers | Rebuilds completely | purchase_orders, purchase_order_items, suppliers | — | — |
| Shifts & cash-up | Rebuilds completely | shifts, shift_sessions, drawer_events | — | — |
| Held orders & audit trail | Rebuilds completely | held_orders, activity_events, audit_logs | — | — |
| Status history | Rebuilds completely | entity_status_history | — | — |
| Coupons & promotions | Rebuilds completely | promotions | — | coupon_campaigns, coupon_events |
