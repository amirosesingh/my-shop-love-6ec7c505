# Health checks: fix the 401, add a Scan Issues button, verify the schema

## What the checks actually say today

Verified against the live database, not the repo SQL files:

- The relational-health function `operational_relational_health()` **already exists**, runs with elevated rights, and is granted to signed-in staff only (not to anonymous visitors). So the "missing stored procedure" symptom is really "nobody is signed in on this device" — the call is refused rather than absent.
- The 401 comes from the feature/schema probe, which fetches the database's table list with a plain request carrying only the project key and no signed-in session. Every other health call goes through the authenticated client; this one does not.
- The error-handling work asked for in Part 3 is already in place from the previous pass: payment tenders, transfer receipt (returns `{ success, error }`), all coupon loads and saves, and the clipboard copy are each wrapped and fall back safely.

## What will change

### 1. One authenticated path for every health call
The table-list fetch stops being a raw request and goes through the same authenticated client the rest of the dashboard uses, so the signed-in staff token is attached. When there is genuinely no session, the panel says so in plain words — "Sign in with a staff account to run the database checks" — instead of showing a bare 401.

The relational-health call gets the same treatment: a refusal is reported as a permission/sign-in message, and a truly absent function is reported separately, so the two are never confused again.

### 2. Scan Issues button on Logic Health
A **Scan Issues** button at the top of `/settings/system?tab=logic-health`. Clicking it:
- re-runs the live database work in real time — feature/schema probe, relational + orphan check, and the read/write probe;
- merges those results with the stored code findings (TODOs, dead handlers, unguarded awaits) from the committed scan;
- renders one itemised list grouped **Critical / Warning / Info**, each row showing file path and line (or table and column, for database items) plus a one-line plain-English fix.

Severity: money, stock and missing tables/columns → Critical; dead buttons and unchecked reads → Warning; TODOs and cosmetic gaps → Info. Progress is shown while it runs, and the whole result can be copied as text.

### 3. Full feature scan across domains
The probe's coverage is re-checked call-site by call-site for Sales/checkout, stock transfers and adjustments, venue/table bookings, ticket and voucher issuance, coupons and promotions, and members/loyalty — including payment splits and payment transactions. Any payload field the code sends that the live tables lack is reported by name.

Per your choice, no migration file is written when nothing is missing; the run ends with an explicit written summary of what must be executed (and "nothing" is a valid answer). If the scan does find a real gap, a migration is proposed for approval before any code depends on it.

## Technical notes

- `src/lib/feature-schema.ts`: replace the raw `fetch` of `/rest/v1/` with the authenticated external client (session bearer + key), and surface 401/403 as a sign-in message.
- `src/lib/db-relations.ts`: distinguish `42883` (function absent) from permission refusal in `runRelationalHealth`.
- New `src/lib/health-scan.ts`: one runner that fans out to `runDbHealth`, `runRelationalHealth`, `runFeatureSchema` and `logicReport()`, normalising everything into a single severity-tagged finding list.
- `src/components/pos/settings/panels/LogicHealthPanel.tsx`: Scan Issues button, running state, merged grouped table, copy-report over the merged result.
- No new database objects unless the live scan proves one is missing.
- Patch version bump per project convention.
