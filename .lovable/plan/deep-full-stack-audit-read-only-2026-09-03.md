# Deep full-stack audit — read-only

Scope: ~592 source files / ~115k lines across web, Electron and Android, 132 database
migrations, 51 test files. Nothing in the repository will be modified. The result is a
single report document delivered to you for review; no code, schema, policy, dependency
or configuration change happens until you approve specific items.

## How the audit runs

Nine parallel read-only investigations, each producing evidence with file:line references,
then one consolidated report.

1. Architecture and data flow — router, route tree, `src/core` vs `src/platforms` split,
   `dbRouter`/commit layer, sync engine, state and context providers; traces UI → service →
   API/RPC → database → UI for the critical POS paths.
2. Security — authentication, authorization, permission checks, secrets handling, relay and
   `/api/public/*` endpoints, client-trust boundaries, injection/XSS/IPC surfaces.
3. Database and RLS — table-by-table policy review (SELECT/INSERT/UPDATE/DELETE), grants,
   security-definer functions, triggers, branch/tenant isolation, spoofable ownership
   columns, conflicting or permissive policies, index and query performance.
4. Financial integrity — sales, payments, refunds, discounts, coupons, points, tax,
   rounding, inventory deltas, transfers, drawer, numbering: duplicates, races, rollback,
   client-side-only validation.
5. Offline and sync — queue durability, idempotency, conflict rules, restart/reconnect
   behaviour, partial-sync outcomes, emergency access independence.
6. Platform — Electron main/preload/IPC hardening, updater, credential storage; Capacitor
   manifest, permissions, cleartext, deep links, WebView; web-only build isolation.
7. Types, build and correctness — typecheck, lint, dead imports/exports, `any` usage,
   promise/await handling, hook dependency and stale-closure bugs, circular imports,
   naming/typo and reversed-condition classes of bug.
8. Dead code and dependencies — files, components, routes, endpoints, database functions,
   feature flags and packages, each traced through dynamic imports, routing, RPC, Electron
   `require` and Capacitor before being classified.
9. Features, UI wiring and tests — per-feature trace of handler → service → API →
   database, loading/empty/error/permission states, plus what the existing 51 test files
   actually cover and where they give false confidence.

## Deliverable

One report following your section structure A–Q (executive summary, critical findings,
security, RLS table-by-table, broken features, dead code, type/build, performance and
memory, database performance, platform, offline/sync, dependencies and configuration,
typos and logic errors, prioritised change table, cleanup candidates split by confidence,
runtime-verification list, and 0–100 scores).

Every finding carries: severity, exact location, evidence, why it matters, risk if left,
the standard fix, affected files/objects, side effects, and whether runtime testing is
required. Findings are marked STATICALLY VERIFIED or RUNTIME VERIFICATION REQUIRED —
nothing is claimed to work purely because the code reads correctly.

The report is delivered as a document attachment in chat. Nothing else is written.

## Technical notes

- Read-only tooling only: file reads, ripgrep, typecheck/lint in report mode, existing test
  suite in read mode, and read-only database queries against the live schema for policies,
  grants, indexes and function definitions.
- Live-database reads are `SELECT` against catalog and application tables only; no writes,
  no migrations, no policy changes.
- Dead-code claims require a negative trace across dynamic imports, the generated route
  tree, RPC call sites, Electron `require`, Capacitor plugin registration and test usage.
