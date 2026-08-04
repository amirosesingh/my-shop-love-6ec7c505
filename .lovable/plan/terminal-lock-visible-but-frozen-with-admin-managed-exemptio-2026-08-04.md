# Terminal lock: visible but frozen, with admin-managed exemptions

## What changes for you

- With no open shift, the terminal no longer swaps to a bare card. The whole app stays on screen exactly as it looks when trading — sidebar, header, register, cart, product grid — but greyed out and completely un-clickable. Nothing can be opened, not even inventory, until a shift is opened.
- A single "Open shift" panel floats over the frozen screen with the cashier name and opening float. It cannot be dismissed.
- Admins and supervisors are exempt: they can use every screen with no shift open. Cashiers and warehouse users are locked.
- Every part of this is a toggle in Staff Management, so the admin can override it for an individual person.

## The lock behaviour

- The freeze moves up from the page body to the whole shell, so the sidebar and the top bar are covered too. Only two controls stay live inside the overlay: the Open-shift form and "Lock / Switch user" (otherwise a locked-out cashier could not hand the terminal back).
- The frozen layer dims and blurs the real UI with pointer events disabled, plus `inert` on the underlying tree so keyboard tabbing, barcode-scanner wedge input and shortcuts cannot reach it either.
- When a shift is open, the existing green header strip (cashier, opened date/time, float, running duration) stays exactly as it is.

## New permission toggle

Added to the Cash Drawer & Shifts group in the Staff Management matrix:

- Use the terminal without an open shift — bypasses the lock entirely.

Defaults: on for admin and supervisor, off for cashier and warehouse. Existing staff records pick the default up automatically, because a stored matrix is filled from the role preset for keys it does not yet contain.

Since nothing at all stays usable while locked, one flag governs the whole terminal — no separate inventory-without-shift toggle.

## Technical notes

- `src/lib/permissions.ts`: add `can_bypass_shift_lock` to `PermissionKey`, `PERMISSION_LABELS`, and the `drawer` group; leave it out of `CASHIER_PERMISSIONS` and `WAREHOUSE_PERMISSIONS` so supervisor/admin (`FULL_PERMISSIONS`) get it and the two limited presets do not.
- `src/components/pos/ShiftGuard.tsx`: rewrite as a frozen-overlay wrapper. It always renders `children`; when `activeShift` is null and `hasPermission("can_bypass_shift_lock")` is false, it wraps them in a container with `pointer-events-none select-none opacity-40 blur-[1px]` plus `inert`, and renders the Open-shift panel and a "Lock / Switch user" button in an overlay sibling. The open action is gated on `can_open_shift`, showing "Ask a supervisor to open the shift" when that flag is off.
- `src/components/pos/AppShell.tsx`: move `<ShiftGuard>` from wrapping `{children}` inside `<main>` (line 381) to wrapping the outer shell element, so nav and header freeze with the body.
- `src/lib/__tests__/permissions.security.test.ts`: the existing "every permission key appears in a group" check covers the new key; add an assertion that the cashier and warehouse presets do not include `can_bypass_shift_lock`.
- No database or schema change — permissions are JSONB on the staff record.
- Version bump to the next patch so the desktop and APK feeds pick it up.