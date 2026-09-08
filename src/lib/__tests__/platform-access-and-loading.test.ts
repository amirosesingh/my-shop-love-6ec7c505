import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("platform access and initial loading", () => {
  it("keeps emergency recovery out of the Web product", () => {
    expect(read("src/routes/recovery.tsx")).toContain(
      'if (!isTerminalApp()) return <Navigate to="/" />',
    );
    expect(read("src/components/shared/EmergencyAccessLink.tsx")).toContain(
      "if (!isTerminalApp()) return null",
    );
    expect(read("src/routes/__root.tsx")).toContain("{isTerminalApp() && (");
  });

  it("resolves the location query before presenting location setup", () => {
    const guard = read("src/platforms/web/components/pos/LocationBootGuard.tsx");
    expect(guard).toContain('return <TillLoader message="Loading locations…" />');
    expect(guard.indexOf("!storesLoaded && loadPhase !== \"failed\"")).toBeLessThan(
      guard.indexOf("No active location"),
    );
  });

  it("contains no active expiry-based offline grace controls", () => {
    for (const file of [
      "src/core/activation/registration-status.ts",
      "src/platforms/web/components/pos/AppShell.tsx",
      "src/platforms/web/components/pos/RecoveryHub.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/graceDays|setGraceDays|graceOpen|offlineGrace|offline-grace/);
    }
  });

  it("does not render raw production errors in the root boundary", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("if (import.meta.env.DEV) console.error(error)");
    expect(root).toContain("import.meta.env.DEV && error.stack");
  });
});
