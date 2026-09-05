# Phase 6 — Prove the rules hold on the server, then report

The last phase. The interface already behaves; this phase checks that the same
rules survive when someone talks to the database directly, closes the two holes
the review found, and finishes with a written report.

## What the review already found

I checked the live access rules table by table before writing this.

**Holding up correctly (leave alone)** — sales, sale lines, shifts and shift
sessions, bookings, purchase orders, payments, stock adjustments, transfers and
transfer lines, parked orders. Each one is tied to the branch of the person
asking, in the database, so changing an ID by hand does not open another
branch's records.

**Hole 1 — activation tokens are open to everyone.** Any signed-in staff member
can read, create, change and delete terminal activation tokens for *every*
branch, not just their own. A cashier could issue a token that activates a till
at head office, or delete one another branch is waiting on.

**Hole 2 — "private branch" is only a screen setting.** Which branch owns a
product is kept in the app's own settings and applied while drawing the screen.
The database holds no owner at all and hands every product to every staff
member. A branch marked private is private in the interface only.

**Configuration files** — the real settings file is already excluded from the
repository and only the example file is shared. Nothing to change; I will just
re-confirm it and that phone and desktop builds still carry no web values.

## What I will change

1. **Activation tokens become branch business.** Reading a token is limited to
   the branch it belongs to. Creating, changing and revoking one requires a
   supervisor or owner, and only for their own branch; an owner may still work
   across branches. Enforced in the database, so the terminals screen keeps
   working and a hand-made request gets nothing.

2. **Branch ownership of a product moves into the database.** Products gain an
   owning branch, filled in from the ownership list the app already keeps, and
   reading is limited so a product owned by a branch that has been switched to
   "private catalogue" is invisible to other branches — enforced centrally.
   Shared products stay visible to everyone exactly as now, and the owner and
   the owning branch keep full access.

3. **A tamper check in the test suite** that plays the part of an outsider:
   asks for another branch's sales, shifts, bookings, purchase orders, payments,
   transfers, tokens and private products with hand-changed IDs, and expects
   nothing back each time.

4. **The closing report** — what was already right and left untouched, what
   changed and why, what was added across all six phases, findings by
   seriousness, and anything still open. Saved as a document you can keep.

## Checks

Full test suite, type check, and a pass over selling, shifts, inventory,
receiving, transfers, terminals, reports and Emergency Access to confirm nothing
that works today stops working. Version bump at the end.

## Technical notes

- Two migrations: policy replacement on `terminal_tokens` keyed to
  `store_id` plus `is_supervisor_now()`; `products.owner_store_id` (nullable,
  `references stores`) with a backfill from `settings.integrations.productOwners`
  and a read policy joining the branch's `private_catalogue` flag, which moves
  from app settings into a column on `stores`.
- `branch-policy.ts` keeps its screen-side helpers; `productVisibleAt` stays as
  the fast local filter and the database becomes the authority behind it.
- New tests: `src/lib/__tests__/branch-isolation.security.test.ts` (ID tampering
  matrix) and coverage for token issuing/revoking by role and branch.
- Report written to `/mnt/documents/pos-hardening-report.md`.
