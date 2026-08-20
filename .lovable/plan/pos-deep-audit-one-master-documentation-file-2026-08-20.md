# POS Deep Audit → One Master Documentation File

Audit-only task. No source, schema, RLS, or test changes. The only file writes are the new master document and the deletion of obsolete audit docs.

## Verified starting point

- Current version is 1.3.20 (`src/version.ts`).
- 476 TypeScript/TSX files under `src/`, 24 test files in `src/lib/__tests__/`, 98 files in `supabase/migrations/`.
- Git history IS available (`git log` works), so the "Recent Changes" section can be evidence-backed rather than marked unknown.
- `docs/` currently holds 11 markdown files; `docs/POS-MASTER-DOCUMENTATION.md` already exists at 1,357 lines and will be fully rewritten, not appended to.

## Documentation cleanup (step 1)

Remove as obsolete/duplicate audit documentation:

- `docs/POS-MASTER-DOCUMENTATION.md` (replaced by the freshly authored master file)
- `docs/system-audit.md`
- `docs/architecture-audit-v2.md`
- `docs/offline-database-fix-report.md`

Keep (operational/deployment/developer docs, not POS audit docs):
`android-apk.md`, `cloudflare-hosting.md`, `run-locally.md`, `secrets.md`, `subdomains.md`, `windows-desktop.md`, `windows-sql-server.md`, plus `db/offline/README.md`, `src/routes/README.md`, `README.md`, `AGENTS.md`.

Then grep the repo for links to the removed files and note any dangling references in the master document.

Archived plan files under `.lovable/plan/` are conversation history, not project documentation — left untouched.

## Output

Exactly one new file: `docs/POS-MASTER-DOCUMENTATION.md`, rewritten from scratch, containing all 42 requested sections with a clickable table of contents. No second file, no temp files left behind.

## Audit method

1. **Database first** — live queries for tables, columns, keys, indexes, triggers, views, enums, RLS policies, grants, and function bodies; then read all 98 migrations for objects that exist only historically.
2. **Code archaeology** — read `src/lib/`, `src/routes/`, `src/components/pos/`, `electron/`, `scripts/`, config and workflow files in domain batches (register/checkout, stock, members/coupons, purchasing, payments, receipts/hardware, shifts/reports, auth/permissions/relay, sync/offline/Electron, settings/admin).
3. **Connection tracing before classification** — for anything that looks unused, check re-exports, dynamic imports, route registration, IPC channel names, string-based RPC names, triggers, views, RLS references, migrations, build/package scripts, and platform-gated imports. Classify only with stated evidence: ACTIVE / INDIRECTLY ACTIVE / COMPATIBILITY / MIGRATION ONLY / DEPRECATED / ORPHANED / DEAD CODE / UNKNOWN.
4. **Both-direction contract audit** — every RPC/table name referenced in code is checked against the live database, and every live database object is checked for code, trigger, view, or policy callers. Mismatches get their own section with severity and evidence.
5. **Recent changes** — `git log` per file plus migration timestamps and version bumps to reconstruct old → transition → current implementation for auth, permissions, branch model, stock, sync/outbox, SQL connection, setup wizard, manager override, POS rules, settings, printing, terminal auth, relay, payments, checkout, reporting.
6. **Tests** — the suite is actually executed with vitest and the real pass/fail/skip counts recorded. Anything not executed is labelled NOT VERIFIED.
7. **Handshake question** — the Electron connect/admin-pool state machine is re-read and diagrammed as it currently stands; it is reported as verified-by-code-review only, since no Windows machine or SQL Server is reachable from here. Real-hardware behaviour stays UNKNOWN — NOT VERIFIED.

## Evidence and honesty rules

Every material claim carries a file path, function, route, table, RPC, migration, test name, or commit. Status labels CONFIRMED / PARTIAL / INFERRED / UNKNOWN / NOT IMPLEMENTED are used throughout, and inference is never written as fact. No secret values are printed — only variable names and locations.

## Depth policy

Because 476 source files cannot all be documented at function-level depth in a usable single file, the file index is tiered and the tier is stated in the document:

- Tier A (full depth): business-logic modules in `src/lib/`, every `*.server.ts` / `*.functions.ts`, all `electron/` modules, all `src/routes/api/**` handlers, core POS components.
- Tier B (purpose, exports, dependencies, dependents, risk): remaining routes and components.
- Tier C (one line in the master index): shadcn/ui primitives and generated files (`src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`).

Nothing is silently omitted — every non-trivial file appears at least in the Master File Index.

## Delivery

The document is written in one file but assembled across several passes (schema pass, code pass, cross-check pass). On completion I report: master file path, docs removed, docs remaining, areas audited, bug count, security finding count, legacy/duplicate implementation count, code/database mismatch count, tests actually executed, and the top 10 risks. Expected size: 4,000-8,000 lines.
