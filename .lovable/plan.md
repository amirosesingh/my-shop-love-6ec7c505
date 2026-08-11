# Login flow repair: internal-domain routing, free username typing, 4–6 digit PIN

## What the scan found

Two internal address formats exist in the code, both ending in `.local`:

- `pos-internal.local` — every staff/cashier account created without a real email
  (`INTERNAL_EMAIL_DOMAIN` in `src/lib/staff-admin.server.ts`, mirrored as a hardcoded
  string in `src/lib/pos-auth.tsx`, `src/lib/staff-admin.ts`, `src/components/admin/StaffManager.tsx`).
- `pos.local` — device/terminal accounts, `terminal.<tokenId>@pos.local`
  (`src/lib/terminal-account.server.ts`). Machine accounts, never typed by a person.

Anything else with an `@` (gmail, outlook, company domains) is a real external email and
keeps standard password sign-in.

## The single-character bug

In `CashierPinLogin.tsx` the person-picker screen renders only while the typed username is
empty. The username field writes to that same state on every keystroke, so the first
character makes the screen swap to the PIN pad and the field unmounts mid-typing.

## Changes

### 1. One shared source of truth for internal domains
New `src/lib/internal-domains.ts` exporting the domain list (`pos-internal.local`, `pos.local`),
`isInternalAddress()`, `isExternalEmail()`, and `toLoginAddress(identifier)` (bare username →
`user@pos-internal.local`, address kept as typed). `pos-auth.tsx`, `staff-admin.ts` and
`StaffManager.tsx` stop hardcoding the string and use these helpers.

### 2. Smart routing on the admin email form
`TerminalLogin.tsx`: when the email field holds a bare username or an internal `.local`
address, submitting switches to the Cashier PIN screen with that identifier pre-filled
instead of attempting a password sign-in. External emails behave as today. A short inline
note explains the switch.

### 3. Free username typing
`CashierPinLogin.tsx`: the typed username lives in its own draft state and no longer drives
the screen swap. The picker stays on screen while typing; the move to the keypad happens only
on Enter, on the "Next" button, or on blur with a completed value. The input becomes
controlled so characters cannot be dropped.

### 4. PIN 4–6 digits, passcode unrestricted
- Keypad accepts 4–6 digits: dots render to the account's `pin_length` clamped to 4–6,
  auto-submit fires on the expected length, and Enter submits any entry of 4+ digits.
- PIN inputs get `inputMode="numeric"`, `pattern="[0-9]*"`, digit-only filtering.
- Accounts on a text passcode (length above 6, or "Type my passcode instead") get a plain
  field with no length cap and no auto-submit — Enter or the Sign in button only.
- `cashierLogin` in `pos-auth.tsx` currently rejects anything that is not exactly 4–6 digits;
  it will accept 4–6 digit PINs and longer text passcodes, matching the server's 4–32 rule.

### 5. Form wrappers
Username entry, keypad, and passcode entry are each wrapped in a `<form onSubmit>` with
`e.preventDefault()`, and submit buttons typed correctly, so Chromium stops warning about
inputs and submit handling outside a form.

## Technical notes

- Files touched: new `src/lib/internal-domains.ts`; `src/components/auth/CashierPinLogin.tsx`,
  `src/components/pos/TerminalLogin.tsx`, `src/lib/pos-auth.tsx`, `src/lib/staff-admin.ts`,
  `src/components/admin/StaffManager.tsx`.
- No database migration and no server-side provisioning change; `staff-admin.server.ts` keeps
  owning `INTERNAL_EMAIL_DOMAIN` and the shared client helper mirrors the same list.
- Existing PIN lockout, offline cached-PIN sign-in, and deactivated-account handling stay as is.
- Version bump on completion.