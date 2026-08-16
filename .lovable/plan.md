# Feature schema audit + Android installer fix

## Part 1 — Live schema & feature health report

Nothing here is judged from the `.sql` files in the repo. A new probe runs the
real queries and mutation payloads each feature sends, against the live
database, and reports what the database answers.

### How the probe works

For every feature, the probe declares the exact column set the UI reads and the
exact column set it writes (taken from the actual call sites, not from
migrations), then:

- **Read check** — a zero-row select of those exact columns. A missing table
  answers "relation does not exist"; a missing/renamed column answers "column
  does not exist".
- **Write check** — a harmless update carrying the full write payload with a
  filter that matches no row. The database still validates table, columns and
  access rules, so a schema gap or a refusal surfaces exactly as a real save
  would fail, but no row is ever created or changed. (This is the same
  no-op-update technique the existing read/write probe already uses.)
- **Required-field check** — nullability and defaults are reported from what
  the database returns, so "null value violates non-null constraint" style gaps
  are caught before a cashier hits them.

### Features covered

| Feature | Probed surface |
| --- | --- |
| Direct sales & checkout | sale header, line items, discounts, tax, split tenders |
| Stock transfers & adjustments | transfer out/in, receipt lines, stock deltas, adjustments |
| Table & venue bookings | slots, resource assignment, deposits |
| Ticket & event bookings | tiers, ticket codes/barcodes, issued vouchers |
| Customers & membership | member records, points, tier movement |

### The report

A new **Feature & Schema Health** section inside System & General → Database
Health, listing one row per feature with:

- Feature name
- Status: HEALTHY / SCHEMA FIX REQUIRED
- The exact database error text (e.g. "Missing column 'event_id' on table 'bookings'")
- The source file and line where that query or mutation is made

Rows expand to show each column the payload sends and whether the live table
accepts it. The report can be copied as text for support.

### Fixes

Whatever the run reports gets fixed in the same pass: rename or drop columns the
code sends but the database does not have, add the missing fields to the
TypeScript payload types, and — where a column is genuinely absent from the live
database — a migration is proposed for approval before any code depends on it.
The diagnosis is deliberately not pre-written here; the live run produces it.

## Part 2 — Android downloads the APK but no installer opens

Three concrete causes, all addressed:

1. **Where the file lands.** The APK is written to the app's private cache
   today. The package installer cannot read that. It moves to the external
   cache directory, and the write is fully flushed and the URI re-resolved
   before the install intent fires.
2. **Permission and provider.** The Android project is generated at build time,
   so the post-sync patch script gains: `REQUEST_INSTALL_PACKAGES` permission, a
   `FileProvider` entry with a paths file covering the external cache, so the
   installer receives a `content://` URI with read permission granted and the
   new-task flag set — never a `file://` path.
3. **Escape hatch.** If the intent still does not open, the error is caught and
   the update card shows "Update downloaded — Tap to install", which re-fires
   the installer against the already-downloaded file. The banner reports the
   real reason rather than a generic failure.

## Technical notes

- New: `src/lib/feature-schema.ts` (probe definitions + runner),
  `src/components/pos/settings/panels/FeatureSchemaReport.tsx`, rendered from
  `DatabaseHealthPanel` and included in "run everything".
- Probes route through the existing external Supabase client / relay used by
  `src/lib/db-health.ts`, so they respect terminal auth and offline mode
  (skipped with a clear reason when the central database is unreachable).
- Android: `src/lib/android-updates.ts` (external cache + flush + fallback
  state), `src/components/pos/AndroidUpdateBanner.tsx` and the Android card in
  Settings → Updates (tap-to-install action),
  `scripts/android-permissions.cjs` (manifest permission + FileProvider +
  `android/app/src/main/res/xml/file_paths.xml`).
- Patch version bump per project convention.
