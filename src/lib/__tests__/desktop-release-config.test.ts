import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("desktop release configuration", () => {
  it("uses the stable latest folder for the packaged updater and fallback", () => {
    expect(read("package.json")).toContain("https://updatecms.luckycharmsdnbhd.com/pos-app/latest/");
    expect(read("electron/updater.cjs")).toContain(
      'const DEFAULT_FEED_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/latest/"',
    );
    expect(read("scripts/desktop-release.cjs")).toContain(
      'const DEFAULT_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/latest/"',
    );
  });

  it("builds Windows and Android from the same committed release version", () => {
    const desktop = read(".github/workflows/desktop-release.yml");
    const android = read(".github/workflows/android-apk.yml");
    const version = read(".github/workflows/version-release.yml");
    expect(version).toContain("version=$(node scripts/bump-version.cjs)");
    expect(version).toContain("[release]");
    expect(desktop).toContain("contains(github.event.head_commit.message, '[release]')");
    expect(android).toContain("contains(github.event.head_commit.message, '[release]')");
    expect(desktop).not.toContain("GITHUB_RUN_NUMBER");
    expect(android).not.toContain("ANDROID_VERSION_CODE: ${{ github.run_number }}");
  });

  it("publishes the same complete cross-platform manifest from either release job", () => {
    for (const path of [
      ".github/workflows/desktop-release.yml",
      ".github/workflows/android-apk.yml",
    ]) {
      const workflow = read(path);
      expect(workflow).toContain("apkUrl");
      expect(workflow).toContain("bundleUrl");
      expect(workflow).toContain("windowsUrl");
      expect(workflow).toContain("s3://updatelccms/pos-app/manifest.json");
    }
  });

  it("can verify the normal installer from latest.yml", () => {
    expect(read("electron/updater.cjs")).toContain('["latest.yml", `${encodeURIComponent(version)}.yml`]');
  });
});
