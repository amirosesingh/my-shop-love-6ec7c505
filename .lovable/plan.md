# One place for the database connection, and fix the two errors

## What I verified (no code changed yet)

1. **"Central cloud database not reachable" on the web app is a name mismatch — confirmed.**
   The resolver `supabaseConfig()` accepts only these name pairs:
   `VITE_POS_SUPABASE_URL` + `VITE_POS_SUPABASE_ANON_KEY`, or `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
   The environment this project actually carries has `SUPABASE_URL` and
   **`SUPABASE_PUBLISHABLE_KEY`** — the key half is spelled differently, so the pair never
   completes. Result: the server prints nothing into the page (I checked the served HTML: no
   config block), the browser has no key, and the app sits on "Connecting…" forever. I loaded
   the app headlessly and it never leaves that screen.

2. **"E is not iterable" — not reproduced yet.** No console or runtime error appeared in the
   headless load, because the app never gets past connecting. I will not guess a cause; the
   first step below is to reproduce it with the connection fixed and read the real stack.

3. **Two separate addresses exist today**, entered in two different panels:
   - Central database URL + publishable key → Database & Cloud Connection panel
   - POS backend web address → Backend Address panel
   They are genuinely different values (your database vs. your POS website), so they cannot be
   merged into one value — but they can and should live on **one screen**, saved and tested
   together, which is what you asked for.

## What I will change

### 1. One canonical set of names, accepted everywhere
Add an alias table in the single resolver (`external-supabase-config.ts`) so the URL and the key
are each recognised under every spelling the project has ever used
(`SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_POS_*`, `VITE_SUPABASE_*`), resolved
into one internal pair. One value, one meaning, no matter where it is set. Update
`.env.example`, `scripts/web-only-env.cjs` and `vite.config.ts` lists to match, so the device
builds still strip all of them.

### 2. One screen to enter everything
Rework Database & Cloud Connection into the single connection screen:
- Central database URL
- API key (publishable)
- POS backend address (the existing Backend Address panel folded in as a third field)
- One "Test connection" that reports all three results, one "Save & connect"

Storage is unchanged: Electron OS vault (DPAPI), Android Keystore, web from hosting values.
The panel also appears on web, read-only, showing which project is in use and where the values
came from — so there is never a hidden second place holding a connection value.
The separate Backend Address panel is removed from the settings and first-run screens (its
saving logic stays and is reused), so the value is entered once and read everywhere.

### 3. The "E is not iterable" error
With the connection resolving, reproduce the error headlessly, read the real stack, fix the
actual cause, and add a regression test. If it turns out to be a symptom of the unconfigured
state above, I will say so instead of inventing a second fix.

### 4. Verification
Typecheck, full test run, headless load of the app reaching the register screen with the cloud
badge green, a grep over the built bundle for stray key-shaped values, and a version bump.

## Technical notes
Files touched: `src/lib/external-supabase-config.ts` (alias table), `src/lib/public-config-script.ts`,
`src/platforms/web/components/pos/settings/panels/CloudConnectionPanel.tsx` (three fields),
`src/platforms/web/components/pos/settings/panels/BackendAddressPanel.tsx` (folded in / removed
from screens), `src/platforms/web/components/pos/ConnectDatabaseScreen.tsx`,
`src/lib/backend-config.ts` (reused unchanged), `.env.example`, `scripts/web-only-env.cjs`,
`vite.config.ts`, plus tests under `src/lib/__tests__/`.
No change to RLS, schema, sync, relay, permissions or Emergency Access.
