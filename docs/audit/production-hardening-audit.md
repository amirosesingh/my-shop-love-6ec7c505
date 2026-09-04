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
