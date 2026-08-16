# Fix false "missing required field" warnings and the terminal health scan

## What is actually wrong

Three of the four complaints are false alarms from the audit screen, not real save bugs:

- `payment_transactions.status` and `metadata` — the checkout payload **does** send both (`salePaymentRows`), and in the live database both columns are nullable with defaults (`'completed'`, `'{}'`). The audit's own column list for that operation is out of date, so it reports fields the till already sends.
- `members.is_verified` — not-null but defaulted to `false` in the database. The till deliberately never sends it so a counter edit cannot un-verify a customer. Correct behaviour, wrongly flagged.
- `coupon_campaigns.claims_count` — not-null with default `0`, and `saveCampaign` already sends it.

Root cause: the audit asks the database for its published table shape, and that shape marks every not-null column as "required" even when the database fills it in automatically. Anything with a default is then reported as a missing field.

The terminal health scan failure is separate: `terminal_commands` exists in the managed database but is **not** included in `supabase/online_schema_fix_latest.sql`, so any instance repaired only with that consolidated script has no such table, and the scan reports it missing from the schema cache.

## The fix

1. **Stop flagging defaulted columns.** Treat a column as truly required only when it is not-null *and* has no default and is not auto-generated. Apply this both in the browser path and in the server relay used by PIN-signed tills, so both agree.
2. **Refresh the audit's declared payloads** so the listed columns match what the code sends today: add `status` and `metadata` to the split-tender operation, and mark the member and campaign operations with their real payload columns. No change to the save logic itself.
3. **Complete the consolidated repair script.** Add the missing `terminal_commands` table (plus its index, grants and row-security policies) to `supabase/online_schema_fix_latest.sql`, and audit the rest of the script against the tables the app reads so nothing else is absent. End the script with a schema-cache reload so newly created tables are visible immediately instead of after a restart.
4. **Run the repair against the managed database** as a migration, then re-run the health scan and confirm no table is reported missing and the three "required field" rows turn green.

## Technical notes

- Required-field detection: filter the published shape's `required` list to columns whose definition carries no `default` and is not marked auto-generated (`src/lib/feature-schema.ts` `loadShapes`, and `src/routes/api/public/health-metadata.ts` for the relay path).
- Audit definitions live in `FEATURES` in `src/lib/feature-schema.ts`; only the `columns` arrays change.
- SQL added idempotently (`CREATE TABLE IF NOT EXISTS`, policy existence guards) so re-running the script is safe, finishing with `NOTIFY pgrst, 'reload schema';`.
