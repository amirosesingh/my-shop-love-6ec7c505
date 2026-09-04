# Production hardening — existing POS only

No rebuild, no parallel systems. Every phase below starts from the module that already
does the job, and changes it only where evidence shows it is wrong, unsafe, or unproven.

## Resolved scope decisions

- **Tenancy:** one backend per company (each till enters its own database URL + key,
  sealed in the OS vault). There is no `company_id` column anywhere today and none will
  be added. "Company isolation" is therefore proven as: backend-per-company separation,
  plus branch/terminal/device ownership enforced server-side.
- **Delivery:** audit first, then straight into the highest-risk fixes in the same pass.
- **Verification:** evidence-based. Anything only mocked is reported as mocked.

## Stage 1 — Audit (no code changes)

Read the existing implementations end to end: branch/terminal tables and RLS, activation
and revocation (`terminal_tokens`, terminal store, activation record), Electron main /
preload / `ipc-guard` / SQL worker, local SQL data-access and migrations, sync engine and
outbox, authorization + approval centre, emergency access, audit log, sales / payments /
refunds / voids / stock / shifts / transfers, secrets and build config.

Output: `docs/audit/production-hardening-audit.md` classifying each area as implemented,
partial, incorrect, insecure, duplicated, dead, or production-risky, with file:line
evidence and severity.

## Stage 2 — Fixes, highest risk first

Only verified defects are touched. Expected order:

1. **Secrets/config.** `.env` is committed to the repository (confirmed). Remove it from
   the working tree, keep `.env.example`, scan git history for service-role keys, database
   passwords, signing and encryption secrets, and report exactly what needs rotating.
2. **Financial + stock atomicity.** Harden the existing sale/payment/stock/shift/outbox
   commit path in the local SQL layer so a partial failure rolls back as one unit; no
   second calculation or commit path is introduced.
3. **Idempotency / duplicate sync.** Strengthen the existing operation identifiers and
   enforce uniqueness server-side so a lost acknowledgement plus retry yields exactly one
   sale, payment, stock movement and audit row.
4. **Ownership and isolation.** Derive branch/terminal from the server-verified credential
   rather than client-supplied values on relay and sync paths; RLS reviewed per table.
5. **Activation / revocation / replacement.** Expiry, single-use, device binding, wrong
   branch rejection, revoked-credential reuse, and the offline revocation policy (a defined
   grace window, never an indefinite bypass).
6. **Electron secure storage + IPC.** No silent plaintext downgrade, no plaintext residue
   after migration, no terminal secret reachable from the renderer; every privileged channel
   allowlisted, schema-validated, parameterised and path-checked.
7. **Authorization + approvals.** Server-side enforcement for every sensitive action, and
   the existing snapshot/hash preserved so an approval cannot be spent on a changed ticket.
8. **Emergency access.** Kept, never removed. Hardened for scope, expiry, rate limiting,
   restricted permissions and local-then-synced audit.
9. **Audit append-only**, migration safety (backup, version check, validate, never recreate
   the local database), and artifact scanning of real build outputs only.

## Stage 3 — Failure-path tests

Vitest suites, reusing existing test infrastructure, for: duplicate sync, double
acknowledgement, timeout after server commit, rollback when payment/stock/audit/outbox
fails, duplicate sale and payment submission, over-refund, invalid transfer quantity,
conflicting offline edits, revoked terminal online and offline, missing/corrupt credential,
unauthorized action, approval required/rejected/expired/snapshot-changed, emergency access
success, failure and rate limit, cross-branch and cross-terminal access, migration failure.

Plus a failure-injection harness that can be run again later on a real till.

## Stage 4 — Verification matrix and go-live checklist

`docs/production-verification-matrix.md` splitting every claim into: verified here,
verified by automated test, requires real Windows till, requires real Android device,
requires real printer, requires real drawer, requires real peripherals, requires a
production-like backend, not yet verified. Hardware behaviour is never marked verified
from a mock.

`docs/first-till-go-live-checklist.md`: install, first-run configuration, activation,
login, local SQL init, sale, print, drawer, offline sale, reconnect and sync, duplicate-sync
recovery, restart, crash recovery, shift open/close, receiving, transfer, refund, void,
approval, emergency access, revocation, replacement, update, backup/restore, printer and
drawer failure, network failure — each with setup, action, expected result, evidence,
pass/fail and recovery step.

## Final report

Reused systems, files changed and why, files deliberately untouched, bugs with severity and
root cause, vulnerabilities by class, blockers, tests executed/added/passed/failed, tests
not performed, database and sync verification, the full terminal lifecycle result,
emergency-access verification, and a single explicit
**PRODUCTION READY** / **NOT PRODUCTION READY** verdict with named remaining blockers.

Expect the honest verdict to be NOT PRODUCTION READY at the end of this pass, because
printer, drawer, real Windows till and real Android verification cannot be executed in this
environment — those will be listed as exactly what remains.

## Technical notes

- Database changes go through migrations with grants and RLS in the same migration; the
  local mirror schema in `database/schema.sql` is updated in step, since it is the single
  source for the schema manager.
- Version bump via `node scripts/bump-version.cjs` on the shipped change.
- No new authorization, approval, sync, audit, terminal, stock or database subsystem.
