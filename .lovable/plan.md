# Part 3 — Product delete protection, silent failures and stock recovery

Three fixes, no architectural change: a real delete guard in the database, honest handling of failures the till currently swallows, and a way to see and retry stock movements that did not land.

## 1. Product delete guard

Confirmed today: the app calls a database routine `product_delete_guard` that does not exist, so every delete falls back to five separate lookups from the browser — and if those also fail, the delete proceeds anyway. The database does hold protective links from sales, purchase orders, branch transfers, stock adjustments and promotions, so a bad delete is refused — but only as a raw constraint error the screen has to guess at.

- Add the missing `product_delete_guard` routine. For one product it answers which record types still point at it (sales, purchases, transfers, adjustments, promotions), plus whether the product exists and whether it is archived.
- That routine becomes the deterministic guard. Constraint-message parsing stays only as a last-resort description, never as the protection.
- Change the delete path so a guard that cannot be reached **blocks** the delete with "we could not confirm this product is safe to remove — try again", instead of deleting anyway.
- Products with sales history keep the existing "archive instead" wording; a product with no history and only cascade-linked rows (barcodes, activity log) still deletes normally.
- Archived products follow the same rule: history still protects them.

## 2. Silent failure audit

Each swallowed failure gets a classification, and only the genuinely harmless ones stay silent.

| Where | Today | Classification | New behaviour |
|---|---|---|---|
| Rules / manager backend | reports since Part 2 | backend drift | unchanged |
| Stock delta apply | logged to sync log, sale continues | data consistency risk | record failed movement for retry + diagnostic event; sale still completes |
| Local mirror copy | logged only | recoverable transient | stays non-fatal, adds diagnostic event and a visible count |
| Duplicate-checkout lookup | returns "unknown" | already correct | keep; add diagnostic event when the lookup fails |
| Shift existence lookup | returns "unknown" | already correct | keep; "unknown" must never read as "no shift"; add diagnostic event and soft warning |
| Product delete guard | returns nothing, delete proceeds | authorisation / drift | now blocks (above) |
| Offline queue fallbacks | expected operational | expected fallback | unchanged |

## 3. Diagnostics

One small helper writes a structured event (kind, entity, reason code, branch, terminal, timestamp) for: backend object missing, stock delta failed, local mirror failed, duplicate-checkout lookup unavailable, shift lookup unavailable. Events carry ids and codes only — never PINs, tokens, prices, customer details or credentials. They feed the existing Data Sync & Audit hub rather than a new screen.

## 4. Stock consistency and recovery

The relative-stock design is unchanged: movement rows go up, the database applies each one once, keyed on the movement id.

- A movement that fails to apply is written to a durable local "unapplied movements" list, so it is never silently discarded.
- Retry is safe by construction — the same movement id can only apply once, so a retry can never deduct twice.
- The Data Sync & Audit hub gains an "Unapplied stock movements" section: what failed, when, why, with "Retry" and "Retry all". Successful retries clear themselves.
- A non-empty list is surfaced as a reconciliation warning, not hidden.

## 5. Idempotency and shift checks

Both already return yes/no/unknown. The work is at the call sites: "unknown" must never be read as "no". Checkout keeps saving (the unique attempt id is the final duplicate guard) and shift opening keeps its cautious path, but each now emits a diagnostic event so an unverifiable check is visible afterwards.

## Tests

New regression tests: delete blocked with sales history, with purchase history, with both, allowed with no history, archived product with history still blocked, guard unavailable blocks the delete, stock delta failure recorded, retry does not double-apply, duplicate-checkout lookup failure yields "unknown" plus an event, shift lookup failure yields "unknown" plus an event, diagnostic events are created, and no sensitive value appears in any event payload.

## Technical notes

- Migration adds `public.product_delete_guard(_product_id uuid)` returning a small JSON object (`exists`, `archived`, `sales`, `purchases`, `transfers`, `adjustments`, `promotions`), `SECURITY DEFINER` with a fixed search path, executable by signed-in staff only, revoked from visitors.
- `src/lib/pos-db.ts`: `productDeleteBlock` returns blocked | clear | unknown; `deleteProductNow` refuses on unknown. `applyStockDeltas` returns per-delta outcomes and records failures.
- New `src/lib/stock-recovery.ts` (durable failed-movement list + retry) and `src/lib/diagnostics.ts` (structured event helper, redaction-safe).
- The Data Sync & Audit hub route gains the unapplied-movements panel.
- Version bump and a short note in `docs/POS-MASTER-DOCUMENTATION.md` closing these items.