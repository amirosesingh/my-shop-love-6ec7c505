import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string) => readFileSync(`.github/workflows/${name}`, "utf8");

describe("GitHub workflow dependency setup", () => {
  it("does not request the removed Android SDK tools package", () => {
    const android = workflow("android-apk.yml");
    expect(android).toContain("uses: android-actions/setup-android@v3");
    expect(android).toContain("packages: platform-tools");
    expect(android).not.toMatch(/packages:\s*(?:['"])?tools\b/);
  });

  it.each(["android-apk.yml", "desktop-release.yml", "ci.yml"])(
    "%s installs the exact lockfile without peer re-resolution",
    (name) => {
      const yaml = workflow(name);
      expect(yaml).toContain("npm ci");
      expect(yaml).not.toMatch(/run:\s+npm install\s*$/m);
    },
  );
});
