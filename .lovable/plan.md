# Fix the blank (black) Electron window

## What is actually wrong

The desktop window is blank because the file it tries to load does not exist.

- `electron/main.cjs` loads `dist/index.html`.
- This app is a TanStack Start SSR app. Its production build does not produce
  `dist/index.html`. It produces a Cloudflare Worker bundle: `dist/client/`
  (static assets) and `dist/server/` (the server bundle).
- So Electron loads a missing file, renders nothing, and you see the black
  background colour set on the window.

Nothing is wrong with your machine, the install, or SQL Server.

## The fix

Build the desktop version for a local Node server instead of Cloudflare, and
have the Electron main process run that server in-process and point the window
at it. This keeps everything working — SSR pages, server functions, the
customer display route — exactly as in the browser.

### 1. Desktop build target

In `vite.config.ts`, when `DESKTOP_BUILD=1` is set, configure the build to use
the Node server preset with output under `dist-desktop/` (client + server).
The normal cloud build is untouched.

### 2. Electron main process serves the app

In `electron/main.cjs`:

- On startup, when not running against the dev server, start the built Node
  server from `dist-desktop/server` on `127.0.0.1` at a free port, with the
  environment variables the app needs (backend URL and publishable key).
- Wait until the port answers, then `loadURL('http://127.0.0.1:<port>/')` for
  the till and `.../display` for the second monitor, replacing the current
  `loadFile(..., { hash })` calls — hash routing was never how this router
  resolves paths.
- Shut the server down on `window-all-closed`.
- If the window fails to load, show the error instead of a black screen: log
  `did-fail-load`, and open DevTools when `POS_DEBUG=1` is set.

### 3. Scripts

- `desktop:build` — build with the desktop target, then launch Electron.
- `desktop:package` — same build, then package, making sure `dist-desktop/`
  is included and `src/` is excluded.
- `desktop:dev` stays as-is (Electron against `npm run dev`); it already works
  because it loads a URL, not a file.

### 4. Docs

Update `docs/run-locally.md`: the blank-window row in the troubleshooting table
now points at the real cause and the fix, plus the `POS_DEBUG=1` tip for
opening DevTools.

## Files touched

- `vite.config.ts` — desktop build target and output dir
- `electron/main.cjs` — start local server, load URLs, load-failure logging
- `package.json` — desktop scripts and packaging ignores
- `docs/run-locally.md` — corrected troubleshooting

No application, UI, or database behaviour changes.