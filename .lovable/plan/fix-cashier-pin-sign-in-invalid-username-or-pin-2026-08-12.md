# Fix cashier PIN sign-in ("Invalid username or PIN")

## What the code scan shows

Two internal address formats exist: staff accounts get `<username>@pos-internal.local`, devices get `terminal.<id>@pos.local` (`src/lib/internal-domains.ts`). Admin/supervisor sign-in works because it is a plain email + password call. The cashier path is different, and has four places where a valid PIN is turned into "Invalid username or PIN":

1. **Auth password is the only accepted proof.** `cashierLogin` in `src/lib/pos-auth.tsx` calls `preparePinSignIn` and then `supabase.auth.signInWithPassword`. If that call fails for any reason (identity has a different password, unconfirmed email, provider hiccup), the function drops straight to `return { ok: false, error: "Invalid username or PIN" }`. The server endpoint that checks the PIN against the stored hash with the internal key (`/api/public/cashier-login` → `verify_terminal_pin`) is only called *after* the Auth login already succeeded, so it never rescues the sign-in.

2. **The account is looked up by username only.** `verifyPin`/`ensurePinAccount` in `src/lib/staff-admin.server.ts` and the `verify_terminal_pin` routine match on `app_users.user_id`. Someone who types the full `name@pos-internal.local` address (which is what is visible in the auth user list) matches nothing. `TerminalLogin` strips the domain when it hands over, but the username box inside `CashierPinLogin` does not.

3. **The healing path assumes the internal address.** `ensurePinAccount` always rebuilds `<username>@pos-internal.local` and ignores the address actually stored on the staff row, so an account whose identity was created under a different address gets its password written to the wrong (or a brand new) identity while the sign-in keeps failing.

4. **Length rules disagree.** Accounts may be provisioned with a 4–32 character credential, but the client rejects any numeric entry over 6 digits before sending, and `/api/public/cashier-login` caps `pin` at 6 characters — a longer passcode is a 400 before the database is ever asked.

## Changes

### 1. Server-side PIN check becomes the authority
`cashierLogin` will call the server endpoint first. If the stored hash matches, the sign-in succeeds and the terminal session is minted from that result, whether or not the Auth password step worked. The Auth password alignment still runs (so later signed-in calls keep working) but no longer decides the outcome.

### 2. Accept the address as well as the username
- The username box in `CashierPinLogin` runs the typed value through `usernameFromAddress`, so `x@pos-internal.local` and `x` behave the same.
- `verifyPin` gains an email fallback: when no row matches `user_id`, look the staff row up by `email`, then verify the PIN against that row's username.

### 3. Use the account's real address when healing
`ensurePinAccount` reads the stored `email` from the staff row and only falls back to the internal domain when the row has none, so the password is aligned on the identity that actually exists.

### 4. One consistent credential length
Allow 4–32 characters everywhere: relax the client guard in `cashierLogin`, widen the `pin` field on `/api/public/cashier-login` and its alias, and keep `issueCashierSession` in step.

### 5. Honest error messages
Distinguish "Invalid username or PIN" (hash mismatch), "Account deactivated", and "Could not reach the central database", instead of collapsing all three into the first.

## Technical notes

- Files: `src/lib/pos-auth.tsx`, `src/components/auth/CashierPinLogin.tsx`, `src/lib/staff-admin.server.ts`, `src/lib/staff-admin.functions.ts`, `src/routes/api/public/cashier-login.ts`, `src/lib/pos-session.functions.ts`.
- No database migration: `verify_terminal_pin` and `app_users` stay as they are; the email fallback is a service-key read of the staff row.
- Lockout, offline cached-PIN sign-in and deactivated-account handling are untouched.
- Version bump on completion.
