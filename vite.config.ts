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

export default defineConfig({
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
  ...(isMobile
    ? {
        nitro: {
          preset: "static" as const,
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
    ...(isMobile ? { spa: { enabled: true }, prerender: { enabled: true } } : {}),
  },
});
