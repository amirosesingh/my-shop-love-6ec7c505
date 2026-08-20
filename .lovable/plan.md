# Part 6 — Safe Refactoring and Performance Optimization

Behaviour-preserving cleanup only. No business-rule changes in any patch. The full suite (`bunx vitest run`) runs after each step; a step is only kept if sales, payments, stock, sync, permissions, printing, offline mode and branch isolation all stay green.

## Current state (measured)

- `src/routes/index.tsx` — 4156 lines, one `Register` component with ~90 `useState` hooks covering cart, tender, exchange, booking/racket intake, shift open/close, member lookup, WhatsApp and layout widths.
- `src/lib/pos-store.tsx` — 2175 lines; persists the **entire** POS state to `localStorage` under `pos-state-v2` on every `state` change (single effect, no debounce, no slicing).
- `src/lib/pos-db.ts` — 2046 lines; already uses the Part 5 batch stock-delta path.
- `src/routes/purchasing.tsx` 1264, `electron/main.cjs` 1176, `src/lib/pos-print.ts` 1029.
- Logging modules that overlap in purpose: `sync-log.ts` (68), `sync-audit.ts` (155), `audit-log.ts` (414), `activity-journal.ts` (81).

## Step 1 — Register decomposition (mechanical, no logic edits)

Split `src/routes/index.tsx` into hooks + presentational modules, moving code verbatim:

- `src/lib/register/use-cart.ts` — lines, quantities, line/cart discount, clear/hold.
- `src/lib/register/use-tender.ts` — method, tendered, references, split tender wiring.
- `src/lib/register/use-booking-intake.ts` — booking + racket-service fields, deposit, due date.
- `src/lib/register/use-checkout.ts` — the charge/commit orchestration (calls the existing `pos-db` checkout unchanged).
- `src/lib/register/use-receipt.ts` — receipt/print/drawer/WhatsApp triggers.
- Layout width/grid state stays with the existing `register-layout.ts`; the route only consumes it.

`Register()` becomes composition of these hooks with the same JSX. Handler bodies are moved, not rewritten; permission gates, manager gates and rule checks travel with their handlers.

## Step 2 — POS state persistence

Keep the `pos-state-v2` key and its exact shape — no schema change, so no migration is needed. Changes are write-frequency only:

- Debounce the persist effect (~300ms trailing) and skip the write when the serialized payload is byte-identical to the last one.
- Persist on `visibilitychange`/`pagehide` so a debounce can never lose the last write.
- If profiling shows the payload is the real cost, a follow-up step may split slices into sibling keys — that step ships with a reader that falls back to `pos-state-v2` and rewrites it, and only after the debounce step is proven.

## Step 3 — Data loading

- Deduplicate concurrent identical table reads through the existing routed-query layer (in-flight promise sharing, short TTL).
- Narrow catalogue selects to the columns the screens actually render; page/limit large lists.
- Drop redundant refreshes triggered by unrelated state changes.
- The offline snapshot/local-mirror path is untouched: same fallbacks, same write-back.

## Step 4 — Stock

No new work; confirm every checkout path goes through the Part 5 batch delta and remove any remaining per-movement call sites that are not the documented fallback.

## Step 5 — Audit/sync logging

Inventory the four modules and their call sites. Consolidate **only** where two writers produce behaviourally identical records; otherwise keep them and document the difference. No stored audit history is deleted or rewritten.

## Step 6 — Index review (analysis only)

Run query/plan inspection over `sales`, `sale_items`, `payment_transactions`, `products`, `item_activity_logs`, sync metadata and branch-scoped filters. Report which access paths are already served and which would benefit. Any index is proposed with its evidence, not applied blindly, and lands as its own migration after review.

## Step 7 — Larger files

`purchasing.tsx`, `electron/main.cjs` and `pos-print.ts` get the same mechanical treatment (extract cohesive modules, no behaviour change) once the register work is stable.

## Out of scope

Business rules, RLS/policy changes, receipt content, pricing, permissions semantics, and any change bundled together with a refactor.
