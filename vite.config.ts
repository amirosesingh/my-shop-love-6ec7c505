// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import webOnlyEnv from "./scripts/web-only-env-names.json" with { type: "json" };

/**
 * `use client` is an RSC package-boundary marker, not a runtime directive.
 * This application uses TanStack Start rather than React Server Components,
 * and its client/server boundaries are already compiled by TanStack before
 * Rolldown runs. Remove the inert marker from known UI dependencies so it is
 * not carried into ordinary browser/SSR chunks as an unknown directive.
 */
function stripThirdPartyRscMarkers(): Plugin {
  const clientPackages =
    /node_modules\/(?:@tanstack\/react-(?:query|router)|@radix-ui\/react-[^/]+|lucide-react|sonner)\//;
  return {
    name: "strip-inert-third-party-rsc-markers",
    enforce: "pre",
    transform(code, id) {
      if (!clientPackages.test(id) || !/^\s*["']use client["'];?/m.test(code)) return null;
      return {
        code: code.replace(/^\s*["']use client["'];?\s*/m, ""),
        map: null,
      };
    },
  };
}

/**
 * Nitro currently supplies both Rollup's legacy `inlineDynamicImports` flag
 * and Rolldown's chunk-group configuration. Keep the intentional chunk groups
 * and remove only the obsolete Rollup flag before Rolldown validates options.
 */
function alignNitroRolldownOutput(): Plugin {
  return {
    name: "align-nitro-rolldown-output",
    enforce: "post",
    configEnvironment(name, config) {
      if (name !== "nitro") return;
      const output = config.build?.rolldownOptions?.output;
      if (output && !Array.isArray(output)) delete output.inlineDynamicImports;
    },
  };
}

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
export const WEB_ONLY_ENV_NAMES = webOnlyEnv.webOnly.filter((name) => name.startsWith("VITE_"));

const isTerminalBuild = isMobile || isDesktop;

const blankWebEnv = Object.fromEntries(
  WEB_ONLY_ENV_NAMES.map((name) => [`import.meta.env.${name}`, "undefined"]),
);

export default defineConfig({
  plugins: [stripThirdPartyRscMarkers(), alignNitroRolldownOutput()],
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
  ...(isTerminalBuild
    ? {
        // Deny by default: the Lovable wrapper otherwise runs
        // loadEnv(mode, process.cwd(), "VITE_") and defines EVERY VITE_* name
        // it finds in the repository's .env — ignoring `envDir`. Turning
        // envDefine off means a new VITE_* variable added to the web
        // environment in the future cannot reach Android or Windows either.
        envDefine: false as const,
        vite: {
          // No .env file in this repository is visible to a device build.
          envDir: "scripts/no-env",
          define: blankWebEnv,
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
