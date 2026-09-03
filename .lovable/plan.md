# Replace the old audit files with one fresh report

No application code, schema, or configuration changes. This is a documentation-only task.

## Remove

- `/mnt/documents/pos-audit-report.md` (26 Aug, superseded)
- `/mnt/documents/POS-DEEP-AUDIT-REPORT.md` (3 Sep, superseded)
- `docs/audit/full-audit-2026-09.md` (stale in-repo copy)

Kept: the operational docs in `docs/audit/` (conflict-rules, feature-inventory, recovery, restore-test, schema-comparison, state-audit, sync-coverage) and `docs/POS-MASTER-DOCUMENTATION.md`.

## Produce

One new file, `/mnt/documents/POS-AUDIT.md`, delivered as a chat attachment, rewritten from the audit evidence already gathered and re-verified against the current code before writing. It follows the same A–Q structure:

- Executive summary and 0–100 scores
- Critical findings, ranked
- Security (auth, relay, secrets, IPC, public endpoints)
- Database and RLS, table by table
- Financial integrity (sales, refunds, stock deltas, rounding)
- Offline and sync
- Platform (Electron, Android, web isolation)
- Types, build, lint
- Dead code and dependencies
- Broken or partially wired features
- Prioritised change table and runtime-verification list

Every finding keeps its severity, `file:line` evidence, why it matters, the standard fix, and a STATICALLY VERIFIED / RUNTIME VERIFICATION REQUIRED label.

## Re-verification before writing

The top findings from the last pass are re-checked against the current tree so the new file is accurate, not a copy: committed `.env` keys, `stock_transfer_items` RLS scoping, refund stock overwrite and double-refund guard, the clock-only emergency code unlocking backend re-pointing, and the two Electron IPC fetch channels. Typecheck, tests, and lint are re-run in report mode only.
