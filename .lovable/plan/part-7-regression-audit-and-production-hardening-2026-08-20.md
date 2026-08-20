# Part 7 — Regression Audit and Production Hardening

Final audit pass. No new features, no second documentation file, no version bump unless the release workflow requires it.

## Scope

1. **Baseline** — run the existing suite (`bunx vitest run`), typecheck and a production build; record failures before touching anything.
2. **Static/schema sync audit** — cross-check every RPC and table name referenced in code against the live database (function list, columns, grants). Any reference that no longer resolves is a bug to fix, not to document away.
3. **Database inspection** — read-only queries for: RLS enabled + policy coverage per table, grants on public tables, branch-isolation predicates, audit/override/telemetry access rules, idempotency keys on sales and stock movements.
4. **Targeted code review** of the workflow areas listed in the request (desktop connection lifecycle, auth/PIN/terminal, POS checkout path, inventory movements, security, data integrity). Fix only defects found — no redesign.
5. **New tests** added under `src/lib/__tests__/` for the gaps named: checkout end-to-end, manager gate, stock retry, stock double-apply, connection cancellation, connection timeout, setup reopen, RLS cross-branch, settings inheritance/locks, tax matrix, refund/exchange math. Existing files already cover some of this (`stock-recovery`, `stock-delta-batch`, `connection-attempt`, `rls-policy-regression`); those get extended rather than duplicated.
6. **Documentation** — update `docs/POS-MASTER-DOCUMENTATION.md` in place with an audit section.

## Verification honesty

Every claim in the final report is filed under one of five buckets, and nothing is promoted between buckets:

- Confirmed by automated tests
- Confirmed by database inspection
- Confirmed by Electron runtime testing (only if actually run here)
- Still requires real Windows hardware
- Still requires production database metrics

Desktop items (SQL Server discovery, Windows Integrated Auth, real named-instance handshake, printer/drawer hardware) cannot be exercised in this environment; they will be tested at the logic level with mocks and listed explicitly as hardware-pending. The report will not call the POS production-ready on the strength of unit tests.

## Final report

Delivered in chat and appended to the master doc: bugs fixed, migrations, security fixes, connection fixes, sync fixes, performance fixes, files changed, tests passed, known limitations, recommended next actions.

## Technical notes

- Fixes stay minimal and local; if a defect needs a schema change it goes through a single migration with explicit GRANT + RLS blocks.
- Test additions are pure-logic where possible (mocked Supabase/IPC) to keep the suite deterministic.
- No changes to generated integration files or the route tree.
