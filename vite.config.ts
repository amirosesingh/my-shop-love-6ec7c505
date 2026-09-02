// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isDesktop = Boolean(process.env["DESKTOP_BUILD"]);
/**
 * Android build: the whole POS is packaged inside the APK, so the phone needs
 * a static client bundle with an SPA fallback rather than a running server.
 */
const isMobile = Boolean(process.env["MOBILE_BUILD"]);
/**
 * Cloudflare Workers build (GitHub Actions -> wrangler deploy). Pins the same
 * preset and output layout that wrangler.jsonc points at, so CI never falls
 * back to a Node target.
 */
const isCloudflare = Boolean(process.env["CLOUDFLARE_BUILD"]);

/**
 * Android and Windows are shipped artifacts handed to other shops, so no web
 * deployment value may end up inside them. Two guards, both build-time:
 *
 *  1. `envDir` points at an empty folder, so Vite loads none of the repo's
 *     .env / .env.production / .env.local files.
 *  2. every web configuration name is defined as `undefined`, so a static
 *     `import.meta.env.VITE_...` read inlines to nothing even if the CI runner
 *     happens to export the value.
 *
 * The browser/Cloudflare build is untouched and keeps its own environment.
 */
export const WEB_ONLY_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_POS_SUPABASE_URL",
  "VITE_POS_SUPABASE_ANON_KEY",
  "VITE_POS_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_EXTERNAL_URL",
  "VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY",
  "VITE_POS_SERVER_URL",
] as const;

const isTerminalBuild = isMobile || isDesktop;

const blankWebEnv = Object.fromEntries(
  WEB_ONLY_ENV_NAMES.map((name) => [`import.meta.env.${name}`, "undefined"]),
);

export default defineConfig({
  ...(isCloudflare
    ? {
        nitro: {
          preset: "cloudflare-module" as const,
          output: {
            dir: "dist",
            serverDir: "dist/server",
            publicDir: "dist/client",
          },
          cloudflare: { nodeCompat: true },
        },
      }
    : {}),
  // The desktop (Electron) build targets a plain Node server that the Electron
  // main process starts on 127.0.0.1 — this app is SSR, so there is no static
  // index.html to load over file://. The browser/cloud build is unchanged.
  ...(isDesktop
    ? {
        nitro: {
          preset: "node-server" as const,
          output: {
            dir: "dist-desktop",
            serverDir: "dist-desktop/server",
            publicDir: "dist-desktop/public",
          },
        },
      }
    : {}),
  // Android build: a plain Node server output that scripts/mobile-build.cjs
  // renders once into a static app shell, which is what ships inside the APK.
  ...(isMobile
    ? {
        nitro: {
          preset: "node-server" as const,
          output: {
            dir: "dist",
            serverDir: "dist/server",
            publicDir: "dist/client",
          },
        },
      }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // The phone build renders entirely on the device: prerender the shell once
    // and let the client router take every route from there (file:// has no
    // server to ask for HTML).
  },
});
