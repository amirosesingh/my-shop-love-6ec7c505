/**
 * A shipped APK or Windows installer must carry no web deployment
 * configuration. These tests guard the build-level rules, not the runtime
 * guard in supabaseConfig().
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("device builds are isolated from web configuration", () => {
  const viteConfig = read("vite.config.ts");

  it("loads no .env file for a mobile or desktop build", () => {
    expect(viteConfig).toContain("const isTerminalBuild = isMobile || isDesktop");
    expect(viteConfig).toContain('envDir: "scripts/no-env"');
  });

  it("blanks every web env name so static reads inline to nothing", () => {
    for (const name of [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_POS_SUPABASE_URL",
      "VITE_POS_SUPABASE_ANON_KEY",
      "VITE_POS_SERVER_URL",
    ]) {
      expect(viteConfig).toContain(`"${name}"`);
    }
    expect(viteConfig).toContain("blankWebEnv");
  });

  it("scrubs web env names from both platform build scripts", () => {
    for (const script of ["scripts/mobile-build.cjs", "scripts/desktop-release.cjs"]) {
      const text = read(script);
      expect(text).toContain("WEB_ONLY_ENV_NAMES");
      expect(text).toContain("VITE_POS_SUPABASE_URL");
      expect(text).toContain("verify-no-web-config.cjs");
    }
  });

  it("gives the device no baked backend address to fall back to", () => {
    const text = read("src/lib/backend-config.ts");
    expect(text).not.toContain("VITE_POS_SERVER_URL");
  });

  it("keeps web environment out of the Android workflow", () => {
    const text = read(".github/workflows/android-apk.yml");
    expect(text).not.toMatch(/VITE_[A-Z_]*SUPABASE/);
    expect(text).not.toContain("VITE_POS_SERVER_URL");
    expect(text).toContain("verify-no-web-config.cjs");
  });

  it("keeps web environment out of the Windows workflow", () => {
    const text = read(".github/workflows/desktop-release.yml");
    expect(text).not.toMatch(/VITE_[A-Z_]*SUPABASE/);
    expect(text).not.toContain("VITE_POS_SERVER_URL");
    expect(text).toContain("verify-no-web-config.cjs");
  });
});
