# Feature inventory — Feature → Data → Cloud → Sync → Recovery

Phase 1 discovery. 89 route files in `src/routes`; grouped below by domain.
"Recovery" answers: after a terminal wipe + reinstall, does the feature's data
come back? (see `sync-coverage.md` for the underlying lists)

## Selling

| Feature | Routes | Tables | Sync | Recovery |
| --- | --- | --- | --- | --- |
| Register / checkout | `index`, `sales`, `pos.*` | sales, sale_items, payment_transactions, item_activity_logs | push only | **lost** |
| Held orders | `holds` | held_orders | push + web pull | lost on desktop |
| Receipts / reprint | `receipts` | sales, sale_items, stores | push only | **lost** |
| Customer display | `display` | (live state) | n/a | n/a |
| Coupons / vouchers | `coupons`, `claim.$campaignSlug`, `c.$tokenSlug` | coupon_campaigns, coupon_events, issued_vouchers | cloud-direct | cloud only |
| Promotions | `promotions` | promotions | push + pull | restored |

## Shifts & cash

| Feature | Routes | Tables | Sync | Recovery |
| --- | --- | --- | --- | --- |
| Open/close shift | `shifts` | shifts, shift_sessions | push only | **lost** |
| Blind cash count & variance | `shifts`, `settings.shift-alerts` | shift_cash_counts, shift_close_events, shift_reconciliations, shift_variance_alerts | cloud RPC only | cloud only |
| Drawer opening | `shifts`, register | drawer_events | push only | **lost** |
| X / Z reports | `shifts`, `reports.sales` | sales, payment_transactions, shifts | derived | **lost** |

## Inventory & purchasing

| Feature | Routes | Tables | Sync | Recovery |
| --- | --- | --- | --- | --- |
| Catalogue | `inventory`, `inventory-hub`, `settings.catalog`, `settings.sku` | products, product_barcodes, product_categories, uom_units | push + pull | restored |
| Stock operations / counts | `stock-operations` | stock_count_drafts, stock_adjustments, stock_delta_applied | push only | **lost** |
| Transfers | `transfers` | stock_transfers, stock_transfer_items (+ legacy `transfers`) | push + scoped pull | restored |
| Purchasing / GRN | `purchasing` | purchase_orders, purchase_order_items | push only | **lost** |
| Suppliers | `suppliers` | suppliers | push + pull | restored |
| Item history | `reports.items`, `reports.stock` | item_activity_logs | push only | **lost** |

## Members & services

| Feature | Routes | Tables | Sync | Recovery |
| --- | --- | --- | --- | --- |
| Membership | `members`, `customers`, `join` | members, membership_tiers | push + scoped pull | restored |
| OTP verification | `verifications` | member_verifications | cloud-direct | cloud only |
| Bookings / racket service | `bookings`, `pos.racket-service`, `pos.general-booking` | bookings, booking_payments | push + scoped pull | restored |

## Multi-store, staff & governance

| Feature | Routes | Tables | Sync | Recovery |
| --- | --- | --- | --- | --- |
| Stores / branches | `stores`, `all-shops` | stores | push + pull | restored (`receipt_prefix` lost) |
| Staff & roles | `staff`, `settings.accounts`, `settings.access` | app_users, staff_roles, user_roles, cashiers | cloud-direct | cloud only |
| Approvals / record edits | `approvals` | authorization_requests, authorization_actions, authorization_log, record_edits | cloud-direct | cloud only |
| Audit & activity | `audit`, `reports.activity` | audit_logs, activity_events, system_audit_logs, sku_audit | audit_logs push; rest cloud-direct | mostly cloud only |
| Terminals & activation | `settings.terminals`, `settings.mobile-terminals` | terminal_tokens, terminal_commands | cloud-direct | cloud only |
| Telemetry / security | `settings.branch-telemetry`, `settings.security-alerts` | branch_telemetry, security_findings | cloud-direct | cloud only |
| Notifications | `settings.whatsapp`, `reports.notifications` | whatsapp_queue | cloud-direct | cloud only |

## Reporting & analytics

`analytics`, `dashboard`, `reports.*` (13 routes) read sales, sale_items,
payment_transactions, item_activity_logs, bookings and the analytics views
`v_daily_store_sales`, `v_daily_item_sales`. All of it is derived from the
push-only transactional set, so **every report is blank on a restored till**
until the cloud copies can be pulled back.

## Settings & system

40+ `settings.*` routes backed by `pos_settings` (pushed, never pulled),
`system_settings` / `sync_state` (local only), and cloud-only
`pos_store_settings`, `settings_scoped`, `settings_overrides`,
`settings_locks`, `secure_settings`. Configuration of a rebuilt terminal is
therefore partly manual.

## Non-obvious features found during the walk

Screen customisation (`settings.elements`, `settings.visibility`,
`settings.lines`), receipt designer, QR/claim public pages, database explorer
and drift tools (`settings.database-explorer`, `settings.diagnostics`,
`settings.logic-health`), inheritance/overrides for multi-branch settings,
sessions management, updates channel, and hardware/printer profiles.
