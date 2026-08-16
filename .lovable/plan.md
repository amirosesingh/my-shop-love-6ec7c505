# Payload defaults, native warnings and safe number inputs

## Audit findings (verified)

- `src/lib/pos-db.ts` — `salePaymentRows` (around line 611) builds each tender row with id, source_type, sale_id, member_id, store_id, shift_id, amount, method, kind, reference, cashier_name, note, paid_at. It sends no `status` and no `metadata`.
- `src/lib/coupons.ts` — `toRow` (line 116) omits `claims_count` entirely, so `saveCampaign` (line 211) never sends it.
- `src/lib/native-http.ts` — lines 153 and 198 catch bridge failures, test the message for "not implemented", and silently fall through to the webview `fetch`. Nothing tells the operator the native path was unavailable.
- `src/routes/coupons.tsx` — the "Maximum coupons" input (around line 538) and "Maximum per member" input both use `e.target.value ? Number(e.target.value) : null`, so entries like `"-"` or `"1e"` land as `NaN` in the draft.
- The live database `payment_transactions` table currently has no `status` or `metadata` columns (the earlier fix script adds them but has not been confirmed applied here); `coupon_campaigns.claims_count` exists and is NOT NULL.

## What to change

**1. Split-tender ledger payload** (`src/lib/pos-db.ts`)
Add `status: "completed"` and `metadata: {}` to every row produced by `salePaymentRows`, guarded so an existing value on the tender wins.

**2. Campaign payload** (`src/lib/coupons.ts`)
Include `claims_count: c.claimsCount ?? 0` in `toRow` so upserts always carry a valid count.

**3. Native HTTP fallback notice** (`src/lib/native-http.ts`)
Replace the silent swallow at lines 153 and 198 with a shared helper that logs the reason and raises a `sonner` toast ("Native network bridge unavailable — retrying through the app browser") once per session per operation, then still falls back to `fetch` so downloads keep working. Toast is fired only in the browser/native runtime, never during SSR.

**4. Safe number inputs** (`src/routes/coupons.tsx`)
Add a small `toPositiveIntOrNull(value)` helper: trims input, returns `null` for empty/invalid, otherwise the floored absolute integer (minimum 1). Use it for both `maxClaims` and `maxPerMember`, so `NaN` can never enter the draft.

**5. Database defaults**
New migration `supabase/migrations/20260816170000_fix_payments_coupons_defaults.sql`, idempotent:
- add `payment_transactions.status text` (default `'completed'`) and `metadata jsonb` (default `'{}'::jsonb`) if missing, backfill existing rows, then set defaults
- `coupon_campaigns.claims_count` — backfill nulls to 0 and set default 0
Also append the same statements to `supabase/online_schema_fix_latest.sql` for direct execution.

## Notes

The migration is applied through the approval flow; the two SQL files are written as repository artefacts so the offline/CLI and dashboard paths stay in sync. No data is modified beyond backfilling nulls.
