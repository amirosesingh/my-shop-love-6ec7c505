# POS Master Technical Documentation — Audit Plan

One file only: `docs/POS-MASTER-DOCUMENTATION.md`. No other docs created, no code changed, no bugs fixed during the audit.

## Scale of the real project (verified)

- 459 source files under `src/`, ~89,500 lines
- ~90 route files in `src/routes/` (incl. `api/` server routes), ~60 POS components in `src/components/pos/`
- Electron desktop layer: `electron/` (MSSQL pool, admin pool, SQLite mirror, sync worker, updater)
- 52 backend tables + ~80 database functions, plus an external POS database reached through the server relay
- 15 existing test files in `src/lib/__tests__/`
- Current version 1.3.13 (`src/version.ts`)

## What the document will contain

All 43 sections requested, with a clickable table of contents, in this one file:

1-4. Executive summary, technology stack (React 19 / TanStack Start / Vite / Tailwind v4 / Supabase-backed cloud / Electron / Capacitor), real directory tree, architecture (web vs desktop vs Android, relay boundary, offline-first sync).
5-7. Module documentation, file-by-file documentation, feature flow chains (UI → component → hook → lib → server fn / API route → database → receipt/UI).
8-12. Frontend, backend/server functions, API endpoint catalogue (`src/routes/api/**`, `*.functions.ts`), full database documentation (tables, columns, keys, functions, triggers, RLS policies, grants), auth and permission matrix.
13-23. POS transaction walkthrough, inventory/stock movement rules, products/SKU/barcodes, members/customers, suppliers, purchasing, payments and tenders, refunds/voids, receipts + ESC/POS + cash drawer + customer display + hardware paths, reports, settings.
24-29. Business rules with file/function/DB impact, state management (contexts, localStorage, SQLite mirror, TanStack Query), dependency map, function index, query index, error handling.
30-36. Security audit (locations and variable names only, never values), performance, code quality/technical debt, bugs and risks with severity, missing features, change-impact analysis, testing and regression map.
37-43. Troubleshooting paths, safe modification guide, master module/file/database indexes, architecture diagrams, "where do I look?" quick-reference table, future maintenance rule, final audit summary.

Every claim is tagged CONFIRMED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / UNKNOWN.

## Depth policy for the file-by-file section

Documenting all 459 files at full function-level depth would produce a file too large to be usable or reliably accurate. The section is therefore tiered, and the tier is stated in the document:

- Tier A (full depth: purpose, key functions with params/returns/logic, dependencies, used-by, modification risk) — every file in `src/lib/` that carries business logic, every `*.server.ts` / `*.functions.ts`, every `electron/` module, every `src/routes/api/**` handler, and the core POS components (register, cart, tender, receipt, shift, sync).
- Tier B (purpose, main exports, dependencies, used-by, risk note) — remaining routes and components.
- Tier C (one-line entry in the Master File Index) — shadcn/ui primitives and generated files (`src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`).

Every file appears at least in the Master File Index, so nothing is silently omitted.

## How the audit runs

1. Query the live database for the real schema: columns, keys, indexes, triggers, RLS policies, grants, function bodies.
2. Read code in parallel batches by domain (POS/sale, inventory/products, members/coupons, purchasing/suppliers, payments/tenders, receipts/hardware, shifts/reports, auth/permissions/relay, sync/offline/Electron, settings/admin).
3. Each domain produces a verified section draft; findings are cross-checked against the code before being written as CONFIRMED.
4. Assemble the single file, then verify: table of contents links resolve, every referenced file path and function name exists, no secret values included.

## Technical notes

- Output path: `docs/POS-MASTER-DOCUMENTATION.md`, expected 4,000-8,000 lines. Written in one file, but assembled section by section across several passes.
- Existing docs (`docs/system-audit.md`, `docs/architecture-audit-v2.md`, `docs/offline-database-fix-report.md`, etc.) are left untouched; the master document supersedes them and links to them as historical notes.
- Diagrams are ASCII in fenced `text` blocks.
- No source file, migration, or configuration is modified by this task.
