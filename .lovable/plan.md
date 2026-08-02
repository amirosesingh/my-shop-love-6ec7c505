# Multi-user shifts: who worked the till today

## What you get

- A cashier can lock the till and another staff member can sign in **without closing the open shift**. The shift keeps running with its own opening float and drawer count.
- Every sale is stamped with the person **actually signed in at that moment**, not the name typed when the shift was opened.
- The open shift shows an "On this shift" list: each user who signed in, with first sign-in time and last activity, plus how many sales and how much value each took.
- The Shifts page gets a "Signed in today" panel listing everyone who used this terminal today, with times.
- X and Z reports print a per-cashier breakdown (name, sales count, cash/card totals) under the shift totals.

## How it works

Today a shift stores a single `cashier` string and every sale copies that string, so a mid-shift user switch is invisible in the data. Three changes fix that.

### 1. Shift attendance

Add to the `Shift` type in `src/lib/pos-types.ts`:

```text
attendance: { staffId, name, role, firstSeen, lastSeen }[]
```

`openShift` seeds it with the signed-in user. A new `notePresence(user)` action in `src/lib/pos-store.tsx` appends or updates an entry; `AppShell` calls it whenever a signed-in user is present and a shift is open. `cashier` stays as the opening cashier, and saved shifts load with `attendance ?? []` so existing data keeps working.

### 2. Sale attribution

`src/routes/index.tsx` currently sets `cashier: activeShift.cashier` on sales, refunds and voids. Switch those to the live `user.name` from `useAuth()`, falling back to the shift cashier. No database change is needed — the sales table already stores a cashier name per sale.

### 3. Sign-in day log

A small `src/lib/shift-attendance.ts` keeps a per-day list in local storage (staff id, name, role, first and last sign-in time), written from the auth provider on successful sign-in. It works offline and survives shift close, which is what makes the "Signed in today" panel possible even across several shifts.

### 4. UI and reports

- `src/routes/shifts.tsx`: "On this shift" table (user, role, from–to, sales, value) inside the active-shift card, plus a "Signed in today" card below it.
- `src/lib/pos-print.ts`: `printShiftReport` gains a per-cashier section for X and Z reports.

Permissions and the lock/sign-in flow are unchanged — locking already returns to the existing sign-in screen, and the shift simply no longer depends on who is signed in.

## Also: hide the "Edit with Lovable" badge

Turn off the badge on published deployments via the publish settings (requires a Pro plan or higher). No code change.