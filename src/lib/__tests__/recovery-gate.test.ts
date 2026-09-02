import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isRecoveryPath } from "../recovery-route";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("emergency access path matching", () => {
  it("matches the recovery screen, including a non-root Android base", () => {
    expect(isRecoveryPath("/recovery")).toBe(true);
    expect(isRecoveryPath("/recovery/")).toBe(true);
    expect(isRecoveryPath("/android_asset/public/recovery")).toBe(true);
  });

  it("does not match anything else", () => {
    expect(isRecoveryPath("/")).toBe(false);
    expect(isRecoveryPath("/settings/system")).toBe(false);
    expect(isRecoveryPath("/recovery-notes")).toBe(false);
    expect(isRecoveryPath(undefined)).toBe(false);
  });
});

describe("recovery is never blocked by connection gates", () => {
  const gate = read("src/platforms/mobile/components/OfflineGate.tsx");
  const boot = read("src/components/pos/NativeBoot.tsx");

  it("the connection gate steps aside on the recovery screen", () => {
    expect(gate).toMatch(/isRecoveryPath/);
    expect(gate).toMatch(/if \(!live \|\| recovery\) return/);
  });

  it("emergency access navigates with the router, never a page load", () => {
    expect(gate).not.toMatch(/<a\s+href="\/recovery"/);
    expect(gate).toMatch(/<Link\s+to="\/recovery"/);
  });

  it("start-up work never stalls the recovery screen", () => {
    expect(boot).toMatch(/onRecoveryScreen/);
    expect(boot).toMatch(/useState\(recovery\)/);
  });
});
