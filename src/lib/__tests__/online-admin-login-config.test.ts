import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Supervisor/Admin online login configuration", () => {
  it("restores activation before applying the current device connection profile", () => {
    const boot = read("src/platforms/mobile/components/NativeBoot.tsx");
    const activation = boot.indexOf(".then(() => hydrateTerminalConfig())");
    const profile = boot.indexOf(".then(() => hydrateConnectionProfile())");

    expect(activation).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(activation);
  });

  it("waits for the device connection profile before password authentication", () => {
    const auth = read("src/lib/pos-auth.tsx");
    const login = auth.indexOf("const login = useCallback");
    const hydration = auth.indexOf("await awaitProfileHydrated()", login);
    const passwordAuth = auth.indexOf("supabase.auth.signInWithPassword", login);

    expect(hydration).toBeGreaterThan(login);
    expect(passwordAuth).toBeGreaterThan(hydration);
  });

  it("keeps cashier login and Emergency Access source untouched by this fix", () => {
    const auth = read("src/lib/pos-auth.tsx");
    const boot = read("src/platforms/mobile/components/NativeBoot.tsx");

    expect(auth).toMatch(/cashierLogin:/);
    expect(auth).toMatch(/issueCashierSession/);
    expect(boot).toMatch(/const \[recovery\] = useState\(\(\) => onRecoveryScreen\(\)\)/);
    expect(boot).toMatch(/const \[ready, setReady\] = useState\(recovery\)/);
  });
});