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
  const boot = read("src/platforms/mobile/components/NativeBoot.tsx");

  it("the connection gate steps aside on the recovery screen", () => {
    expect(gate).toMatch(/isRecoveryPath/);
    expect(gate).toMatch(/if \(!live \|\| recovery\) return/);
  });

  it("emergency access navigates with the router, never a page load", () => {
    const link = read("src/components/shared/EmergencyAccessLink.tsx");
    expect(link).toMatch(/<Link\s+to="\/recovery"/);
    expect(gate).toMatch(/<EmergencyAccessLink/);
    for (const file of [
      "src/platforms/mobile/components/OfflineGate.tsx",
      "src/platforms/web/components/pos/TerminalActivation.tsx",
      "src/routes/__root.tsx",
      "src/platforms/web/components/pos/CloudSetupGate.tsx",
    ]) {
      expect(read(file)).not.toMatch(/<a\s+href="\/recovery"/);
    }
  });

  it("start-up work never stalls the recovery screen", () => {
    expect(boot).toMatch(/onRecoveryScreen/);
    expect(boot).toMatch(/useState\(recovery\)/);
  });
});

describe("no fresh-install screen is a dead end", () => {
  it("the first-run naming form steps aside on the recovery screen", () => {
    const setup = read("src/platforms/web/components/pos/FirstRunSetup.tsx");
    expect(setup).toMatch(/onRecoveryScreen/);
    expect(setup).toMatch(/if \(recovery\) return <>\{children\}<\/>;/);
  });

  it("the activation screen and the error screen both offer emergency access", () => {
    expect(read("src/platforms/web/components/pos/TerminalActivation.tsx")).toMatch(
      /<EmergencyAccessLink/,
    );
    expect(read("src/routes/__root.tsx")).toMatch(/<EmergencyAccessLink/);
  });

  it("routes missing terminal configuration to connection setup before activation", () => {
    const root = read("src/routes/__root.tsx");
    const configBranch = root.indexOf("if (notConfigured && isTerminalApp())");
    const setup = root.indexOf("<ConnectDatabaseScreen", configBranch);

    expect(configBranch).toBeGreaterThan(-1);
    expect(setup).toBeGreaterThan(configBranch);
    expect(root.slice(configBranch, setup + 100)).not.toMatch(/<TerminalActivation/);
  });

  it("hides Emergency Access only while no connection value has ever been saved", () => {
    const setup = read("src/platforms/web/components/pos/ConnectDatabaseScreen.tsx");
    expect(setup).toMatch(/Object\.values\(state\.have\)\.some\(Boolean\)/);
    expect(setup).toMatch(/\{hasSavedConfiguration && \(/);
  });

  it("does not start terminal cloud authentication before configuration is ready", () => {
    const auth = read("src/lib/pos-auth.tsx");
    expect(auth).toMatch(/const \[authEnabled, setAuthEnabled\] = useState/);
    expect(auth).toMatch(/if \(!authEnabled\) return;/);
    expect(auth.indexOf("if (!authEnabled) return;")).toBeLessThan(
      auth.indexOf("supabase.auth.onAuthStateChange"),
    );
  });

  it("the emergency keypad uses its own lockout counter and resets on mount", () => {
    const pinGate = read("src/platforms/web/components/pos/EmergencyPinGate.tsx");
    expect(pinGate).toMatch(/LockoutScope = "recovery"/);
    expect(pinGate).toMatch(/lockoutRemaining\(SCOPE\)/);
    expect(pinGate).toMatch(/alive\.current/);
  });
});
