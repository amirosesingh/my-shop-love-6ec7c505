# Fix: receipt branding columns missing on the live database

## What is happening

The Settings screen now saves company name, tax/registration number, phone, website, fonts, custom lines and QR settings. Those fields need matching columns in the `pos_settings` table of your own live database. That table still has only the original columns, so saving fails with "Could not find the 'company_name' column of 'pos_settings' in the schema cache".

This is a database-side gap, not an app bug — the app writes to your external project, and the new columns were never added there.

## The fix

Add a new script `supabase/schema6.sql` that you run once in your live project's SQL editor. It:

- Adds the missing columns to `public.pos_settings`, each guarded with `if not exists` so it is safe to re-run:
  - `company_name text`, `tax_number text`, `reg_number text`, `phone text`, `website text`
  - `fonts jsonb not null default '{}'::jsonb`
  - `custom_lines jsonb not null default '[]'::jsonb`
  - `qr jsonb not null default '{}'::jsonb`
- Backfills the existing settings row with sensible defaults (empty custom lines, QR disabled, fonts empty so the app defaults apply).
- Re-asserts the staff-only access rules on the table so nothing is loosened.
- Ends with `notify pgrst, 'reload schema';` so the API picks up the new columns immediately instead of after a cache timeout.

I will also append the same columns to `supabase/schema_final.sql` so a fresh install already includes them.

## App-side safety

`src/lib/pos-db.ts` will tolerate a database that has not been upgraded yet: if a settings save fails because of an unknown column, it retries with only the original columns and shows a clear message pointing at `schema6.sql`, instead of failing opaquely. Reads already fall back to defaults when the fields are absent.

## Steps

1. Create `supabase/schema6.sql` with the column additions, backfill, policy re-assert and schema reload.
2. Update `supabase/schema_final.sql` so new deployments match.
3. Harden the settings save path in `src/lib/pos-db.ts` with the fallback and explicit error message.
4. Verify the Settings screen saves and reloads branding values once the script has been run.