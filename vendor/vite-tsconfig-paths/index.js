/**
 * Compatibility adapter for wrappers that still call vite-tsconfig-paths.
 * Vite 8 resolves tsconfig paths natively, so this plugin only enables that
 * built-in resolver and avoids the retired tsconfck parser dependency.
 */
export default function tsconfigPaths() {
  return {
    name: "vite-tsconfig-paths-native",
    config() {
      return { resolve: { tsconfigPaths: true } };
    },
  };
}
