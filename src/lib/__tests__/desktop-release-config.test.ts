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

  it("assigns a new build version before resolving release metadata", () => {
    const workflow = read(".github/workflows/desktop-release.yml");
    expect(workflow).toContain("Assign automatic build version");
    expect(workflow.indexOf("Assign automatic build version")).toBeLessThan(
      workflow.indexOf("Resolve release identity"),
    );
    expect(workflow).toContain('node scripts/bump-version.cjs --set "$version"');
  });

  it("can verify the normal installer from latest.yml", () => {
    expect(read("electron/updater.cjs")).toContain('["latest.yml", `${encodeURIComponent(version)}.yml`]');
  });
});
