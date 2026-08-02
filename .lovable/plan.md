# Self-host the POS to remove Lovable branding

Move the application off Lovable-managed hosting so the "Edit with Lovable" badge is no longer injected, while keeping the existing Supabase backend operational.

## Goal

- The public site must be served from the user's own infrastructure (no Lovable hosting).
- No externally injected "Edit with Lovable" badge or Lovable branding.
- The current POS database/auth/ storage remains available during the transition.

## What we will change

### 1. Export the project to Git

- Connect the project to a GitHub or GitLab repository from **Project settings → Git** so the full source, history, and build scripts can be cloned and run outside Lovable.
- This gives the user ownership of the code and lets CI/CD run on their own runner.

### 2. Replace Lovable-specific build tooling

- Current: `vite.config.ts` imports `defineConfig` from `@lovable.dev/vite-tanstack-config`, which bundles Lovable devtools, sandbox detection, and default Cloudflare Workers targeting.
- Change: rewrite `vite.config.ts` to use a standard TanStack Start / Nitro configuration.
- Remove the `@lovable.dev/vite-tanstack-config` dependency from `package.json` and `devDependencies`.
- Keep the existing TanStack Start router, server functions, and SSR entry point.

### 3. Target a self-hosted runtime

- Default to a **Node.js server** target (Nitro's `node-server` preset). This is the easiest self-hosted option: build once, run `node .output/server/index.mjs` behind Nginx or a Docker container.
- Add an optional `Dockerfile` and `docker-compose.yml` for containerized deployment.
- Keep the Cloudflare Workers option documented as a comment/alternative, but do not make it the default.

### 4. Environment variables

- The existing `.env` contains Lovable-managed Supabase credentials. These stay valid for the backend, but the build must read them from the user's own environment in production.
- Create a `.env.example` file listing every variable required by the app (Supabase URL, publishable key, project ID, and any other secrets used by server functions).
- Update server functions to read `process.env['...']` inside handlers, which they already do; no runtime change is needed beyond ensuring the variables are present at deploy time.

### 5. Keep or migrate the backend

- Lovable Cloud is Supabase under the hood. The app can continue to point at the same Supabase project URL and key from the self-hosted frontend; Lovable Cloud backend access does not depend on Lovable hosting.
- For full ownership, add a follow-up option to migrate the Supabase project to a self-hosted Supabase instance or managed Supabase account. This step is out of scope for the immediate badge removal but will be documented.

### 6. Remove Lovable runtime telemetry (optional)

- `src/lib/lovable-error-reporting.ts` reports to Lovable preview hooks. It is harmless and only runs when `window.__lovableEvents` exists, but it is Lovable-specific.
- Remove this file and its import from `src/routes/__root.tsx` to eliminate any Lovable runtime dependency.

### 7. Build and deploy

- Add `build:node` and `start` scripts to `package.json` for the Node preset.
- Verify the production build passes (`vite build`, `node .output/server/index.mjs`) in a clean environment.
- Provide a deployment checklist: Nginx reverse proxy, SSL certificate, environment variables, and health-check endpoint.

### 8. Desktop build path

- The existing Electron docs assume the app is bundled from the Lovable project. The self-hosted build artifacts will feed the same Electron shell, so no Electron change is needed unless the build output directory changes.

## Out of scope

- No feature changes to POS, staff, inventory, or reports.
- No database schema changes.
- No custom domain or Lovable URL rename.

## Deliverables

- Rewritten `vite.config.ts` for self-hosted Node.js.
- Updated `package.json` with self-host scripts and removed Lovable Vite config dependency.
- New `.env.example`.
- New `Dockerfile` and `docker-compose.yml`.
- Updated `README.md` section: "Self-hosting".
- Removed `src/lib/lovable-error-reporting.ts` and its import.
- Verified build output.

## Verification

- `bun install` succeeds without `@lovable.dev/vite-tanstack-config`.
- `bun run build` produces a Node server in `.output/`.
- `node .output/server/index.mjs` starts and serves the app on localhost.
- A test request to the local server returns the app HTML without a `__lovable` window object or Lovable badge.
