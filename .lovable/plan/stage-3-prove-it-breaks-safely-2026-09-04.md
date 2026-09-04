# Stage 3 — prove it breaks safely

Stages 1 and 2 fixed the money path and the terminal lifecycle. What is left before
anyone can call this ready is evidence: a set of tests that deliberately break things
mid-operation, one page that says what has actually been proven, and a checklist for
the day you go live.

## 1. Failure-injection suite

Each case forces a failure at the worst possible moment and asserts the till ends in a
state an operator can recover from — never a lost sale, never a double charge, never a
stock figure that drifts.

**Checkout and payment**
- Connection dies after the bill is written but before the tenders are.
- Central database refuses one row in the middle of a basket (already covered in part;
  extend to a refusal on the *first* row and on the *last*).
- The same tender is submitted twice (retry after a timeout) — one charge only.
- The app is killed between "paid" and "printed"; on restart the bill is present once.

**Stock**
- Two tills sell the last unit of the same product at the same moment.
- A stock movement is retried after a timeout — the delta is applied once.
- A restore runs while rows are still waiting to be sent — nothing queued is overwritten.

**Shift**
- Connection lost during shift close; the blind count is queued and reconciles on return.
- A sale is attempted against a shift that is already closing — refused, not silently lost.

**Activation and identity**
- Stored activation is corrupt or hand-edited — refused, terminal returns to activation.
- Token revoked while the till is mid-basket — the current sale finishes locally, the
  next sync is refused, the screen locks.
- Grace window expires while offline — the till stops trading and says why.

**Bridge and shell**
- A malformed instruction from the window is refused with a clean message (done).
- The local SQL server disappears mid-batch — rollback, outbox keeps the work.

Where a case cannot be driven from a unit test, it goes in the manual column of the
matrix rather than being faked.

## 2. Verification matrix

One document, `docs/audit/verification-matrix.md`: every requirement in one column, how
it is proven in the next (automated test name, live database check, or "manual — hardware"),
and its current state. Nothing is marked proven without a pointer to the thing that proves it.

## 3. Go-live checklist

`docs/audit/go-live-checklist.md` — the ordered list for the day itself: configuration to
confirm, the hardware run-through (receipt printer, cash drawer, a Windows till, an
Android device), the first-day watch list, and how to roll back.

## 4. What stays open

Hardware cannot be exercised from here. The plan is to have every software case automated
and the hardware cases written down precisely enough that one person with a till can walk
them in an hour, and only then does the verdict change.

## Technical notes

- New tests under `src/lib/__tests__/failure-injection/`, one file per area, using the
  existing fakes (`pos-db`, relay, `repo.cjs` harness) rather than new mock frameworks.
- Concurrency cases assert against the real `stock_apply_deltas` behaviour already in the
  database, using a throwaway product and cleaning up after themselves.
- No production code changes are expected. Any defect the suite finds is fixed in the same
  stage and recorded in `production-hardening-audit.md`.
- Version bump via `node scripts/bump-version.cjs`.
