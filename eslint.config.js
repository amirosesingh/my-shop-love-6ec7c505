import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-desktop",
      ".output",
      ".vinxi",
      ".wrangler",
      "release",
      "capacitor-shell",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Existing boundary adapters still need typed follow-up work. Keep this
      // visible as debt without making it indistinguishable from correctness
      // and security failures.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // A few Electron integration tests intentionally load CommonJS modules
    // from the desktop runtime. Application TypeScript remains ESM-only.
    files: ["src/lib/__tests__/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Screens must go through the data layer (`dbRouter`/`db-query`), so an
    // offline till keeps working instead of hitting the cloud directly.
    files: ["src/components/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"],
    ignores: [
      // Sign-in and diagnostics are about the connection itself.
      "src/components/admin/StaffManager.tsx",
      "src/components/pos/ConnectionCheck.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/integrations/supabase/external-client", "@/integrations/supabase/external-client"],
              message:
                "Screens must not read or write the central database directly. Use dbRouter / routedQuery from @/lib/db-router so the till still works offline, or an admin helper from @/lib/admin-session.",
            },
          ],
        },
      ],
    },
  },
  // Formatting is checked by Prettier, not surfaced as thousands of ESLint
  // correctness failures. This only disables conflicting style rules; it does
  // not weaken hooks, TypeScript, refresh, or restricted-import validation.
  prettier,
);
