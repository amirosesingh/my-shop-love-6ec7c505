# Feature visibility, SQL repair, verified members & dynamic health

Large scope, so this is staged. Each stage is independently shippable; I'll work top to bottom unless you reorder.

## Stage 1 — Consolidated SQL repair (unblocks the errors you're seeing)
Rewrite `supabase/online_schema_fix_latest.sql` as one idempotent script covering every change made so far plus the new tables:
- `branch_telemetry`, `payment_types`, `audit_logs`, `coupon_campaigns` defaults, `pos_settings.logo_data_url`, booking/payment columns.
- New `integration_settings` (provider, encrypted credentials, verification channel, active flag).
- New `member_verifications` (member, phone, email, OTP hash, expiry, verified timestamp).
- New `members.is_verified` / `verified_at` columns.
- All statements defensive (`IF NOT EXISTS`, `DO $$ ... END $$`), GRANTs + RLS + policies for every table, ending with `NOTIFY pgrst, 'reload schema';`.
The same SQL is applied to the cloud database through the migration tool so you don't have to run anything manually; the file stays for the offline/self-hosted copy.

## Stage 2 — Defensive schema handling + feature visibility
- Wrap reads of optional tables (`branch_telemetry`, `integration_settings`, `payment_types`, `audit_logs`) so a missing table degrades to an empty state with a notice instead of a crash.
- Cross-check every route file against the sidebar/hub config and surface the currently unlinked ones (settings sub-pages, `/inventory-hub`, `/pos/racket-service`, `/pos/general-booking`, diagnostics, telemetry, security alerts) as tiles or nav entries. Public pages (`/join`, `/claim/...`, `/c/...`) stay out of staff nav by design.
- Regroup navigation into: Sales & Operations, Inventory & Supply Chain, Customers & Marketing, Staff & Administration, System & Settings.

## Stage 3 — Verified members (OTP)
- Settings → "Communication & verification gateway" panel: channel toggle (Email / SMS / WhatsApp), credential fields (WhatsApp Cloud, Twilio, SMTP/SendGrid, SMS gateway), strict-verification switch.
- Credentials encrypted before storage, reusing the existing secure-settings encryption path; never returned in plaintext to the browser.
- `OtpVerificationModal` on the customers page for new/edited contact details; server function generates + sends the code via the active channel and stores only a hash; member flagged Verified on success. Strict mode blocks unverified creation.
- OTP verification log view under Customers.

## Stage 4 — Layout, receipts, health, reports
- Full-width fluid layouts: replace `max-w-*` + `mx-auto` page shells with `w-full` / `flex-1` grids across dashboards, tables, settings and POS.
- Settings drawer widened (600–750px desktop, full width mobile), tiles grid primary view, nested settings open in-place.
- Visual receipt designer: field toggles, logo show/hide + height/alignment, spacing/margin/character-width sliders, custom CSS box, and a side-by-side live preview.
- Dynamic health: database scan reads `information_schema` tables/columns/constraints/indexes at runtime instead of a fixed list; logic scan walks live routes/stores/RPC hooks; each run purges the previous report and shows only the fresh one.
- Reports upgrade: profitability (gross/net, COGS, landed margin, tax), inventory velocity & dead stock (>60 days), staff/shift analytics (voids, returns, drawer variance), tender breakdown.
- Permission audit trail with before/after diffs in Staff & Roles.
- Update banner with release notes and "Update & restart" for Electron and web; safe-area sticky headers everywhere.

## Technical notes
- OTP send/verify run as server functions; provider tokens are read server-side only.
- Health scanner uses a security-definer RPC that returns schema metadata, so it works for PIN-logged staff too.
- Nav restructure edits `src/components/pos/nav-config.ts` only; route files stay where they are so deep links keep working.
