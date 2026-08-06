# Guarantee auth context everywhere and fail soft instead of crashing

The app root already wraps everything in `AuthProvider` → `PermissionsProvider` → `PosProvider`, so `/settings` is covered by design. The crash came from the auth module being loaded twice, which creates two separate contexts: the provider fills one, `useAuth()` reads the other, and the read throws. This plan makes that situation impossible to hit silently, and non-fatal when it does.

## What changes

**1. One auth module, one context**

- Normalise the two remaining relative imports (`src/lib/ui-visibility.ts` and `src/lib/pos-store.tsx` use `./pos-auth`) to the `@/lib/pos-auth` alias so every consumer resolves through one path.
- Store the auth context object on a module-level global key, so even if the module is evaluated twice both copies share one context instance. This removes the failure class rather than only reporting it.

**2. Duplicate-instance warning (dev only)**

- On module evaluation, count how many times the auth module has initialised. From the second onwards, log a clear console warning naming the likely cause (mixed `@/lib/...` and relative imports, or a stale dev cache) and the fix (use the alias everywhere, then reload).
- Silent in production builds.

**3. Safe fallback in `PermissionsProvider`**

- Read auth through a non-throwing accessor. When context is missing:
  - briefly after mount, render a small centred loading state;
  - if it is still missing, render a "Session context unavailable" panel with **Reload** and **Clear local cache and reload** buttons, matching the recovery options in the root error boundary.
- Never throw, so a bad module graph can no longer blank a whole page.

**4. Root guarantee stays explicit**

- Keep the provider stack in `src/routes/__root.tsx` as the single place auth is mounted, with a comment stating no route may mount its own `AuthProvider`.

## Technical notes

- `src/lib/pos-auth.tsx`: create the context through a `globalThis` symbol registry; export `useAuthOptional()` returning `null` instead of throwing; keep `useAuth()` throwing for normal call sites; add the dev duplicate-load counter and warning.
- `src/lib/pos-permissions.tsx`: use `useAuthOptional()` plus the loading/error fallback UI, built from the shadcn `Button` and `lucide-react` icons already imported there.
- `src/lib/ui-visibility.ts`, `src/lib/pos-store.tsx`: import specifier change only.
- No database, routing, or backend changes.