# Fix "Local database is not connected" on Open shift, and lock the shift name to the signed-in user

## What is actually happening (verified in the code)

1. The Windows desktop app only opens its local SQL Server connection when someone
   presses **Connect** on Settings → Local database. That is the single place that
   calls the `pos:connect` bridge (`LocalDatabaseSettings.tsx` → `electron/main.cjs`).
2. The connection details are saved **inside the app window's sealed store**, not in the
   desktop shell itself. So when the app restarts, the shell has no idea what to connect
   to and never reconnects on its own.
3. Any write after that hits `getPool()` in `electron/db/pool.cjs`, which throws the exact
   message you see: **"Local database is not connected"**.
4. Opening a shift on the desktop goes straight to the local database with no alternative:
   in `commitOps` (`src/lib/pos-db.ts`), when the desktop bridge is present the write is
   attempted there and a failure is thrown — it never falls back to the cloud or to the
   on-disk queue. So one unconnected pool blocks trading entirely.
5. Side effect of the same branch: the new **Local / Online database mode** switch is
   ignored on the desktop, because the bridge branch runs before the mode is consulted.

## The fix

### 1. Reconnect by itself
- Store the local database settings in the desktop shell's own secure store (alongside the
  existing branding/terminal stores) whenever they are saved or tested successfully.
- On start-up the shell connects with those saved settings before the window is usable,
  and retries in the background (short backoff) if SQL Server is still starting.
- If the pool drops later, the next write triggers one automatic reconnect attempt before
  reporting a failure.

### 2. Never block a shift because of it
- In `commitOps`, when the desktop write fails: fall back to the central database if the
  chosen mode allows it, otherwise to the on-disk queue, exactly as the browser does today.
  The shift then opens and the toast says where it landed ("saved offline, will sync").
- Only a genuine "nowhere to save it" case shows an error.

### 3. Say something useful when it does fail
Replace the bare message with plain wording and the actual next step, for example:
"Can't reach the local database on this computer (SQL Server at
`localhost\\SQLEXPRESS` is not responding). The shift was saved on this terminal and will
sync. To reconnect: Settings → Sync & Backup → Local database → Test, then Connect."
The status pill and Sync & Backup also show a red "Local database offline — reconnect"
row with a one-click **Reconnect** button.

### 4. Shift name follows the sign-in, and cannot be edited
- The Open shift dialog stops being a free text box. It shows the signed-in person's
  name as fixed, read-only text (sign in as user **A** → the shift reads **A**).
- Applied in all three places a shift can be opened: the shift lock screen
  (`ShiftGuard.tsx`), the register dialog (`routes/index.tsx`) and the Shifts page
  (`routes/shifts.tsx`).
- The name written to the shift row is taken from the session, not from the form, so it
  cannot be spoofed. If somehow nobody is signed in, the Open shift button is disabled
  rather than defaulting to "Cashier".

## Technical notes
- New `electron/localdb-store.cjs` (same shape as `branding-store.cjs`), written via a new
  `pos:saveConfig` handler and read on `app.whenReady` to auto-connect.
- `electron/db/pool.cjs`: keep the last good config and add `ensurePool()` that reconnects
  once before throwing; error text gains the server/instance name.
- `src/lib/pos-db.ts`: desktop branch of `commitOps` wraps the bridge write in try/catch and
  continues into the existing cloud/outbox path instead of throwing.
- `src/lib/local-db.ts`: expose `reconnect()` for the settings button.
- Version bump to 1.2.49.

## Preserved
Product deletion protection and archive modals, `/api/cashier-login` and session token
hashing, POS layouts, terminal branch binding, and barcode scanning are untouched.
