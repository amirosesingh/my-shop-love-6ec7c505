# Take the branch from the central database and keep a local copy

Today the till's branch ID and name are typed in by hand on the Branch identity
card, or come from the activation record. The branch list that already loads
from the central database is not used to fill them in, so a branch renamed
centrally keeps its old name on the till, and a hand-typed ID can be wrong.

## What changes

1. **Read the branch from the central database.** When the branch directory
   loads (it already does, on start-up and after sign-in), the till looks up its
   own branch in that list — matched by the branch it was activated to, the
   branch bound at sign-in, or the only branch that exists when the business has
   one.

2. **Save it locally.** The matched ID and the current central name are written
   to the till's own storage and to the local database on Windows, using the
   same save path the card uses today. A rename in the central database reaches
   the till on the next load. Nothing is written while the branch is unknown, so
   an existing local value is never wiped by a failed read.

3. **Branch identity card becomes a picker.** Instead of two free-text boxes,
   the card lists the branches from the central database and the operator
   chooses one; the name comes with it. If the list cannot be reached (offline,
   or a fresh till), the card falls back to the current typed fields so a
   machine can still be set up by hand.

4. **Show where the value came from.** A short line on the card says whether the
   branch is fixed by activation (then the picker is read-only), taken from the
   central database, or entered by hand.

## Technical notes

- `src/lib/pos-store.tsx` (~line 602, where `setKnownBranches` runs): after the
  store list is loaded, resolve `activeBranchId(...)`, find the matching store,
  then call `bindTerminalBranch(id, name)` and `writeBranch({ branchId, branchName })`
  from `@/core/local-db/local-db`. Skip entirely when no id resolves.
- `writeBranch` already mirrors into the Windows local database through
  `electronDb()?.setBranch(...)`, so no new bridge or IPC channel is needed.
- `src/platforms/web/components/pos/BranchSettings.tsx`: swap the two inputs for
  a select fed by the loaded store list (`usePos()`), keeping the manual inputs
  as the fallback when the list is empty; saving still goes through
  `writeBranch` plus `bindTerminalBranch`.
- Activation stays the highest authority: `activeBranchId` already prefers
  `readTerminalConfig()?.locationId`, so an activated till cannot be pointed at
  another branch from this card.
- No database migration, no schema change. Version bumped with
  `node scripts/bump-version.cjs`.
