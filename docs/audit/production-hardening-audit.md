# Production hardening audit — existing POS only

Read-only audit of the shipped system, followed by targeted fixes. No subsystem was
rebuilt, duplicated or replaced. Emergency access was kept.

## Area classification

| Area | State | Evidence |
| --- | --- | --- |
| Branch / terminal ownership on the relay | Implemented | `src/core/api/relay-policy.server.ts:46-70,384-406` rewrites or refuses every store-scoped row against the proven caller's branch; child rows resolve through their parent (`sale_items` → `sales`). |
| Caller proof | Implemented | `src/core/api/pos-relay.server.ts:451+` fails closed and reads all proofs, so an admin on a registered till keeps the admin role pinned to that till's branch. |
| Allow-listed routines | Implemented | `RELAY_RPCS` (`pos-relay.server.ts:266`) checks permission and record ownership before running `sale_refund` with the service key. |
| Local SQL writes | Implemented | `electron/db/repo.cjs:536-547` runs each batch in one SQL Server transaction with rollback. |
| Central batch writes | **Fixed** (was production-risky) | PostgREST has no cross-request transaction; `commitOps` ran ops in a bare loop, so a refusal mid-basket dropped the remaining writes. |
| Stock deltas | **Fixed** (was incorrect) | `withRelativeStock` only matched `insert`, but every movement is written as `upsert`, so the relative-delta path was dead code and each sale pushed a client-computed absolute stock figure. |
| Duplicate sale writer | **Fixed** (was dead + risky) | `db.recordSale` was fire-and-forget; the register uses the awaited `pos-store` path. The unawaited copy is removed. |
| Idempotency | Implemented | Client-generated ids with `on_conflict` merge (`pos-relay.server.ts:347-368`), per-tender `client_transaction_id` 409 reconciliation, movement-id dedupe in `stock_apply_deltas`. |
| Approvals | Implemented | Ticket snapshot + fingerprint verified at claim time; single-use grant. |
| Secrets / `.env` | No action needed | `.env` holds only the Lovable-managed publishable key, URL and project id, and is git-ignored (`.gitignore:39`). No service-role key, JWT or `sb_secret_` value present, so nothing requires rotation. |
| Emergency access | Untouched | Device-clock code, independent of network, registration and cloud config, as specified. |

## Fixes applied

1. **`src/core/api/pos-db.ts` — `runBatchLive`.** All three commit paths (online-only,
   desktop, browser) now run the batch through one helper. On a non-connection failure
   after at least one write has landed, the remaining ops are enqueued in the durable
   outbox, a `partial_commit` diagnostic is recorded, and the error is still raised.
   Connection failures are untouched so the existing local fallback keeps working.
2. **`src/core/api/pos-db.ts` — `withRelativeStock`.** Counts `upsert` movements as well
   as `insert`, restoring the server-side relative stock application and removing the
   lost-update race between two tills selling the same product.
3. **`src/core/api/pos-db.ts` — removed `db.recordSale`.** No unawaited sale writer can
   let a checkout print while the bill is silently lost.
4. **`src/lib/diagnostics.ts`** — new `partial_commit` diagnostic kind.

## Tests

`src/lib/__tests__/online-commit.test.ts` gained "parks the rest of a half-stored basket
instead of dropping it". Full suite: 59 files, 406 tests, all passing.

## Stage 2 — terminal lifecycle, desktop bridge, emergency access (v1.3.116)

### Terminal lifecycle

| Rule | State | Evidence |
| --- | --- | --- |
| The trust decision belongs to the server | **Fixed** | `terminal_token_claim` is now a `SECURITY DEFINER` routine that decides; the till only presents an id, a device name and a device proof. |
| A claim is bound to the device that made it | **Fixed** | `src/core/activation/device-proof.ts` derives a per-device HMAC from the sealed device secret and sends it as `p_proof_hash`; a claim from a second device is refused, the same device may re-present. |
| A revoked or expired code cannot activate | **Fixed** | The routine raises `TERMINAL_TOKEN_REVOKED` / `TERMINAL_TOKEN_EXPIRED`; `activationFailureMessage` turns each into a plain sentence instead of a generic failure. |
| A code for a closed or missing branch cannot activate | **Fixed** | `TERMINAL_BRANCH_REQUIRED` / `TERMINAL_BRANCH_INACTIVE`, where inactive means the `stores` row is deleted, archived or switched off. |
| Revoked credentials cannot be reused for sync | Implemented | `pos-relay.server.ts:499` refuses a revoked terminal token before any write. |
| Offline grace really ends access | Implemented | `startupDecision` treats `grace-expired` as unregistered (`startup-decision.test.ts`). |

Verified against the live database with a throwaway branch and four throwaway tokens:
first claim accepted, second device refused, same device re-accepted, revoked / expired /
inactive-branch each raised their own error. All test rows removed afterwards.

### Desktop bridge

- `electron/ipc-guard.cjs` gained declared argument shapes: `writeOp`, `writeOps`
  (max 500 ops, 5000 rows each, five known kinds, identifier-only table names),
  `options` / `connectionConfig` (scalars only) and `terminalConfig`.
- `electron/main.cjs` applies them to `pos:write`, `pos:write-batch`, `pos:connect`,
  `pos:test`, `pos:housekeep`, `pos:restore*`, `pos:compare-*` and `terminal:write`,
  with the check outside the `try` so a bad argument is refused rather than reported
  as a database error.
- `electron/terminal-store.cjs` now has exactly two states: sealed, or refuse. When the
  machine's vault is unavailable the activation is not written at all and the operator is
  told why; an older plain file is migrated into the vault and deleted on first read.

### Emergency access

Every attempt — granted or refused, with the remaining attempts and cool-off — is written
to the local audit trail and travels with the next sync. Rate limiting and cool-off were
already in place via `pin-lockout.ts` and are unchanged.

### Tests

New: `terminal-store.test.ts` (sealed write, refusal without a vault, migration of a plain
file) and `ipc-guard.test.ts` (write kinds, table names, batch caps, nested options,
activation shape, clean refusal). Full suite: 61 files, 416 tests, all passing.

### Verdict

Still **NOT PRODUCTION READY**: the failure-injection suite, the verification matrix and
the go-live checklist remain, and nothing has yet been exercised on real hardware
(receipt printer, cash drawer, a Windows till, an Android device).
