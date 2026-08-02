# Mid-shift user switching + "who signed in today"

## What you get

- A cashier can lock the till and another staff member signs in **without closing the open shift**. The shift keeps its opening float and drawer count.
- Every sale, refund and void is stamped with the person **actually signed in at that moment**, not the name captured when the shift was opened.
- The Shifts page shows a simple "Signed in today" list for this PC: name, role, first sign-in time, last sign-in time.

No attendance/HR module, no per-cashier report totals — just the sign-in visibility above.

## How it works

Today a shift stores one `cashier` string and every sale copies it, so a mid-shift switch is invisible. Two small changes fix that.

### 1. Sale attribution

`src/routes/index.tsx` sets `cashier: activeShift.cashier` on sales, refunds and voids. Switch those to the live `user.name` from `useAuth()`, falling back to the shift cashier. No database change — the sales table already stores a cashier name per sale.

### 2. Sign-in day log

New `src/lib/shift-attendance.ts` keeps a per-day list in local storage (staff id, name, role, first and last sign-in time), written from the auth provider on each successful sign-in. Works offline and survives shift close, so the list covers the whole day even across several shifts.

### 3. UI

`src/routes/shifts.tsx` gets a "Signed in today" card listing each user with their times. The lock/sign-in flow itself is unchanged — locking already returns to the sign-in screen; the shift simply no longer depends on who is signed in.

## Also: hide the "Edit with Lovable" badge

Turn the badge off for published deployments via publish settings (requires Pro plan or higher). No code change.
