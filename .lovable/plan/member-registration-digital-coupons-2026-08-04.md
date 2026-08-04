# Member Registration & Digital Coupons

A public-facing signup and coupon system that lives on two subdomains and writes straight into the POS database, plus a Promotions admin module and till-side redemption.

## 1. Database (POS database, script `supabase/schema19.sql`)

Two new tables you run once on your own POS database, same as previous schema files.

- `coupon_campaigns` — `id`, `name`, `slug` (unique), `discount_type` (`PERCENTAGE` | `FIXED_AMOUNT`), `discount_value`, `scope` (`BILL` | `CATEGORY` | `PRODUCT`), `scope_value` (category name or product id), `max_claims` (null = unlimited), `claims_count`, `starts_at`, `expires_at`, `is_active`, `is_welcome` (auto-issued at signup), `created_at`, `updated_at`.
- `issued_vouchers` — `id`, `token_slug` (unique, e.g. `vch_k8f2a1`), `campaign_id`, `member_id`, `status` (`ISSUED` | `REDEEMED` | `EXPIRED`), `issued_at`, `redeemed_at`, `redeemed_by`, `redeemed_sale_id`, `store_id`.
- Row-level security: public read of a campaign by slug and a voucher by token only; all writes go through database functions so claim counts and redemption cannot be tampered with from the browser.
- Functions: `coupon_claim(slug, phone, full_name)` (finds or creates the member, checks window/limit/active, issues one voucher per member per campaign, returns the token) and `voucher_redeem(token, sale_id, store_id, staff)` (atomic single-use lock — a second attempt fails).

Note on scope: the catalog has categories and products but no separate "brand" field today, so campaign targeting offers Whole bill / Category / Single product. Brand can be added later if you add a brand column to products.

## 2. Promotions admin module

New page **Promotions → Coupon campaigns** in the POS backoffice (admin only, alongside the existing promotions rules):

- Create/edit form: name, public slug, discount type + value, scope (bill/category/product), max claims (blank = unlimited), start and expiry date+time, active toggle, "use as welcome reward" toggle.
- Campaign table with live counters: claimed / limit, status chip (Scheduled, Live, Expired, Off), copyable public claim link, and a QR of that link for posters.
- Drill-in list of issued vouchers per campaign with member, issue time, status and redemption time.

## 3. Public routes (no login, work on both subdomains and the main domain)

- `/join` — Full name, mobile, optional email. Looks up `members` by phone; creates the member if new. If a welcome campaign is live, issues a voucher and redirects to the voucher page.
- `/claim/$campaignSlug` — validates the campaign (active, inside window, under limit) before showing anything; phone entry; unknown phone reveals a one-field name box; then issues the voucher and redirects.
- `/c/$tokenSlug` — voucher view: discount, Lucky Charms member badge, QR encoding the token, live countdown to expiry. Expired hides the QR with "THIS COUPON HAS EXPIRED"; redeemed hides the QR with a red "COUPON ALREADY REDEEMED on <timestamp>".
- These pages render standalone (no POS sidebar/shell) and are excluded from the shift lock and terminal guards.

## 4. Subdomains

`member.luckycharmsdnbhd.com` and `redeem.luckycharmsdnbhd.com` both point at this app. Host-aware handling: the member host sends `/` to `/join`, the redeem host sends `/` to a "scan your coupon link" page, and links generated in admin use the redeem host. Paths keep working on the main domain too. You add both subdomains under Project settings → Domains.

## 5. Till redemption

- Register scan bar: scanning a voucher QR (or pasting a token) attaches the member to the cart and applies the campaign discount per its scope — whole bill, matching category lines, or the specific product line.
- Phone search on the register also lists that member's active, unexpired vouchers to apply with one tap.
- Completing the sale calls `voucher_redeem` atomically; a used or expired token is rejected at the till with a clear message, and the public voucher link locks instantly.
- Redemptions appear in the existing Coupon Usage report and the audit trail.

## Technical notes

- Campaign/voucher reads and writes go through the existing external POS Supabase client plus the new security-definer functions; no service keys in the browser.
- Voucher tokens are random, unguessable, and single-use; claim endpoints are rate-limited per phone per campaign.
- Version bump and a short section in the docs on the two subdomains.
