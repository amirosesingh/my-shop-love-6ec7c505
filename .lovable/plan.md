# Saved settings, 58mm printing, audit categories and coupon voucher tracking

## 1. Settings that stay saved

Settings pages currently write as you type, so a field that fails to reach the database
only shows up as a wrong value after a restart.

- Each settings page gets a footer bar: **Save settings**, **Discard changes**, and a
  status line ("All changes saved · 09:14" / "Unsaved changes" / "Could not save — retry").
- Edits are held in the page until you press Save, then written to the database in one
  go and confirmed. Nothing is applied half-way.
- Leaving a page with unsaved changes asks first.
- Saved values are re-read from the database on start, so re-running the app never
  re-adds defaults or re-creates entries that were removed. Setting groups that are
  missing in the database (payment accounts, booking services, branch policies, time
  zone, integrations) are added to the stored record so they survive too.
- Display & text size stays per terminal (it is hardware, not company policy) but is
  also written to that terminal's record so a reinstall restores it.

## 2. Text size actually changes text

The text-size slider only affects elements inside the scaled shell today, so many
screens look unchanged. It will drive the root font size instead, so headings, tables,
dialogs and menus resize together, while buttons keep their touch-safe minimum height.
The settings preview reflects the real result.

## 3. 58mm slips cut off on the left

The 58mm layout prints a body wider than the paper's real printable area, so the left
edge falls off the roll.

- 58mm printable width is corrected to the roll's true print band, and column counts,
  font sizes, barcode and QR widths are recalculated from it.
- A per-paper **Print width (mm)** and left-offset control is added to Receipt printer
  settings, so a printer that starts a few millimetres further right can be nudged.
- Barcodes and QR blocks scale to the printable width instead of a fixed size.
- The test slip prints an edge ruler so you can confirm nothing is clipped.

## 4. Audit and activity trail categories

The category filter becomes a dropdown of business-language groups rather than
technical names: Sales, Payments, Returns & exchanges, No-sale / drawer, Discounts &
coupons, Inventory, Shifts & attendance, Members, Settings, Security. Every logged
action maps to one of these, old records included, and the same names are used in the
row badges, the detail panel and CSV export.

## 5. Coupon campaigns: full voucher register

- Opening a campaign shows a **Vouchers** tab listing every token created for it:
  token, member, phone, issued date, expiry, source (claimed / issued manually) and
  status — Available, Used (with bill number, shop, cashier, time), Expired, Disabled.
- Counters at the top: created, available, used, expired, disabled, redemption rate.
- Search and status filter, plus CSV export of the voucher register.
- **Disable voucher** action (single or bulk). A disabled voucher can no longer be
  scanned at the till; the reason and who disabled it are recorded.
- A used voucher is already locked at redemption; the till now also refuses disabled
  and expired ones with a clear message instead of a generic error.
- Every event — created, claimed, issued manually, redeemed, disabled, re-enabled,
  blocked attempt — is written to the coupon event log in the same transaction and is
  visible and exportable from the Audit log tab.

## Technical notes

- New `supabase/schema22.sql`: `issued_vouchers` gains `DISABLED` status plus
  `disabled_at`, `disabled_by`, `disable_reason`; new `voucher_set_status` security
  definer function writing a `coupon_events` row; `voucher_redeem` rejects `DISABLED`;
  a campaign voucher-register view for the admin list.
- `src/lib/pos-db.ts` `saveSettings` writes the full settings record and returns the
  saved row so the UI can confirm; a `useSettingsDraft` hook backs the new save/discard
  footer used by every `SettingsFrame` page.
- `src/lib/use-ui-scale.ts` applies `--pos-text-scale` to the root font size;
  `styles.css` keeps control min-heights on `--pos-scale` only.
- `src/lib/pos-print.ts`: `PAPER_MM`/`paperCss` corrected for 58mm, printable width and
  offset read from printer prefs, barcode/QR sized relative to it.
- `src/lib/audit-log.ts`: category taxonomy rewritten with legacy mapping; `audit.tsx`
  and the activity report use the shared list.
- `src/lib/coupons.ts` plus a new `CampaignVouchers.tsx` tab in `src/routes/coupons.tsx`.
- Version bump on release.