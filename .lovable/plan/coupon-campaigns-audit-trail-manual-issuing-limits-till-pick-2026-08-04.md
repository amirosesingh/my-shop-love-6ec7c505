# Coupon campaigns: audit trail, manual issuing, limits, till picker, analytics

Everything below is managed from **Promotions → Coupon campaigns**, and runs on your own POS database (a new `supabase/schema20.sql` you run once, same as previous scripts).

## 1. Database (`supabase/schema20.sql`)

- New table `coupon_events` — the audit trail. Columns: event type (`CLAIMED`, `ISSUED_MANUAL`, `REDEEMED`, `BLOCKED`), campaign, voucher token, member, phone, store/shop, terminal, staff name and role, note, and timestamp. Append-only: no edits, no deletes.
- `coupon_campaigns` gains `max_per_member` (default 1) and `issued_vouchers` gains its own `expires_at` so a manually issued voucher can carry a custom expiry that overrides the campaign window.
- Existing single-voucher-per-member unique index is replaced by a counted rule so `max_per_member` of N is honoured.
- Updated functions: `coupon_claim` counts the member's vouchers for that campaign and refuses over the cap (writing a `BLOCKED` event); `voucher_redeem` now also respects the voucher's own expiry and writes a `REDEEMED` event with store and cashier.
- New function `coupon_issue_manual(slug, phone, full_name, expires_at, staff, store)` — backoffice issuing that bypasses the public claim window but still respects the per-member cap unless overridden.

## 2. Promotions admin additions

Inside the coupon campaigns page, per campaign:

- **Campaign form** gains "Max vouchers per member" (blank = unlimited).
- **Issue a voucher** dialog: pick an existing member from search, or type a phone number (creates the member if new), optional custom expiry date/time, then issue. The resulting voucher link and QR are shown to copy or send.
- **Audit log tab**: filterable table of every claim, manual issue, redemption and blocked attempt, with timestamp, member, phone, shop, terminal, cashier and voucher token. Filters by campaign, shop, event type and date range.
- **Performance panel**: per campaign totals for issued, claimed, redeemed, redemption rate, plus the sales value and discount value of bills that used its vouchers, over a chosen date range, with a simple day-by-day trend. **Export CSV** for both the analytics rows and the audit log.

## 3. Till (Register POS) voucher picker

- When a member is attached to the sale and holds more than one live voucher, a **"Vouchers (n)"** button opens a picker listing each voucher: campaign name, discount, scope, expiry, and the exact currency amount it would take off *this* cart.
- The list is sorted by best value; picking one applies it, and switching selection swaps cleanly. Vouchers that do not qualify for the current cart are shown greyed with the reason.
- Scanning a voucher QR still works exactly as it does today.

## 4. Linking the subdomains on Cloudflare

The app already serves `member.…` and `redeem.…` from the same build; only DNS and Lovable domain wiring are needed.

1. Publish the project, then in **Project settings → Domains** add three entries separately: your main domain, `member.luckycharmsdnbhd.com`, and `redeem.luckycharmsdnbhd.com`.
2. In Cloudflare DNS, add the records Lovable shows for each entry. Because you are on Cloudflare, tick **"Domain uses Cloudflare or a similar proxy"** in the Advanced section when connecting — that switches setup to CNAME-based verification, which works with the orange-cloud proxy.
3. Wait for each to go Active (SSL is issued automatically). Nothing else changes in the app: `/join`, `/claim/:slug` and `/c/:token` keep working on the main domain too, and the admin copy-link buttons always generate `redeem.…` links.

A short section covering this goes into the docs.

## Technical notes

- All writes stay behind security-definer functions on the external POS Supabase client; the browser keeps only the publishable key.
- Audit events are written inside the same transaction as the claim/redeem so the log cannot drift from reality.
- Analytics join `issued_vouchers` to `sales` through the redeemed sale id, so revenue impact is real bill data, not estimates.
- Version bump on release.
