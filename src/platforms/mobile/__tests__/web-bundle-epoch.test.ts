import { describe, expect, it } from "vitest";
import { BUNDLE_EPOCH, isBundleEpochCompatible } from "@/lib/bundle-epoch";
import { bundleDecision } from "@/platforms/mobile/web-bundle-updates";

describe("OTA bundle compatibility", () => {
  it("rejects a bundle that declares no epoch (published before the fix)", () => {
    expect(isBundleEpochCompatible(undefined)).toBe(false);
    expect(isBundleEpochCompatible(BUNDLE_EPOCH - 1)).toBe(false);
    expect(isBundleEpochCompatible(BUNDLE_EPOCH)).toBe(true);
    expect(isBundleEpochCompatible(BUNDLE_EPOCH + 5)).toBe(true);
  });

  it("purges an old contaminated bundle left over from before an APK upgrade", () => {
    // Higher version than the shell, but from before the epoch existed.
    expect(bundleDecision({ version: "9.9.9", path: "/data/web/9.9.9" }, "1.3.93")).toBe("purge");
  });

  it("serves a newer compatible bundle", () => {
    expect(
      bundleDecision({ version: "1.3.94", path: "/data/web/1.3.94", epoch: BUNDLE_EPOCH }, "1.3.93"),
    ).toBe("serve");
  });

  it("purges a compatible bundle that is not newer than the shell", () => {
    expect(
      bundleDecision({ version: "1.3.90", path: "/data/web/1.3.90", epoch: BUNDLE_EPOCH }, "1.3.93"),
    ).toBe("purge");
  });

  it("does nothing when the device has no stored bundle", () => {
    expect(bundleDecision(null)).toBe("none");
  });
});
