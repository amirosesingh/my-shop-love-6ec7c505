import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Self-hosted TanStack Start config. Builds a Node.js server with Nitro's
// `node-server` preset so the app can run on your own infrastructure.
export default defineConfig({
  server: {
    port: 8080,
    strictPort: false,
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
    nitro({
      preset: "node-server",
    }),
  ],
});
