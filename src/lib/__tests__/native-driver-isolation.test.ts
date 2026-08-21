/**
 * Windows authentication runs in its own OS process, so a wedged or faulting
 * native ODBC connect can be killed without taking the till down. These tests
 * exercise the real supervisor and a real worker process — nothing is mocked,
 * because the whole point of the change is process behaviour.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require_ = createRequire(import.meta.url);
const root = path.resolve(__dirname, "../../../electron/db");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const native: any = require_(path.join(root, "native-client.cjs"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const target: any = require_(path.join(root, "sql-target.cjs"));

afterEach(() => {
  native.shutdown("test-teardown");
  native.resetCrashState();
});

describe("direct-mode target normalisation", () => {
  it("turns a named instance with a pinned port into one host,port string", () => {
    const t = target.normalizeDirectTarget({ server: "PCNAME\\SQLEXPRESS", port: 1450 });
    expect(t.direct).toBe("PCNAME,1450");
    expect(t.host).toBe("PCNAME");
    expect(t.instanceName).toBe("SQLEXPRESS");
    expect(t.usesBrowser).toBe(false);
  });

  it("honours a port typed inline after the instance name", () => {
    const t = target.normalizeDirectTarget({ server: "PCNAME\\SQLEXPRESS,1433" });
    expect(t.direct).toBe("PCNAME,1433");
  });

  it("cannot build a direct target without a port", () => {
    const t = target.normalizeDirectTarget({ server: "PCNAME\\SQLEXPRESS" });
    expect(t.direct).toBeNull();
    expect(t.usesBrowser).toBe(true);
  });
});

describe("migration audit", () => {
  it("flags a named instance with no pinned port", () => {
    const audit = target.auditConnectionConfig({ server: "PC\\SQLEXPRESS", directConnect: true });
    expect(audit.ok).toBe(false);
    expect(audit.issues.map((i: { code: string }) => i.code)).toContain("EMISSINGPORT");
  });

  it("passes a pinned named instance", () => {
    const audit = target.auditConnectionConfig({
      server: "PC\\SQLEXPRESS",
      port: 1433,
      directConnect: true,
    });
    expect(audit.ok).toBe(true);
    expect(audit.target).toBe("PC,1433");
  });

  it("reports nothing to migrate when no connection is saved", () => {
    const audit = target.auditConnectionConfig(null);
    expect(audit.configured).toBe(false);
    expect(audit.issues).toHaveLength(0);
  });
});

describe("isolated worker supervision", () => {
  it("reports a missing native driver as an error instead of crashing", async () => {
    await expect(
      native.openNative({
        driverConfig: { server: "127.0.0.1", port: 1433, options: {} },
        target: "127.0.0.1,1433",
        attemptId: "missing-driver",
        timeoutMs: 15_000,
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/EDRIVER/) });
  }, 30_000);

  it("kills the worker on timeout rather than waiting for the native call", async () => {
    const started = Date.now();
    await expect(
      native.openNative({
        driverConfig: { server: "10.255.255.1", port: 1433, options: {} },
        target: "10.255.255.1,1433",
        attemptId: "slow",
        timeoutMs: 1_200,
        simulateHang: true,
      }),
    ).rejects.toMatchObject({ code: "ETIMEOUT" });
    expect(Date.now() - started).toBeLessThan(8_000);
    // The stuck process is gone, not parked for reuse.
    expect(native.diagnostics().workers).toBe(0);
  }, 30_000);

  it("never spawns more than the configured number of driver processes", async () => {
    const attempts = [1, 2, 3, 4].map((n) =>
      native
        .openNative({
          driverConfig: { server: "10.255.255.1", port: 1433, options: {} },
          target: "10.255.255.1,1433",
          attemptId: `burst-${n}`,
          timeoutMs: 1_000,
          simulateHang: true,
        })
        .catch(() => null),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(native.diagnostics().workers).toBeLessThanOrEqual(native.diagnostics().maxWorkers);
    await Promise.all(attempts);
  }, 30_000);

  it("stops offering retries after three consecutive driver crashes", async () => {
    for (let i = 0; i < 3; i += 1) {
      await native
        .openNative({
          driverConfig: { server: "127.0.0.1", port: 1433, options: {} },
          target: "crashy,1433",
          attemptId: `crash-${i}`,
          timeoutMs: 8_000,
          simulateCrash: true,
        })
        .catch((err: { code?: string }) => expect(err.code).toBe("EDRIVER_CRASH"));
    }
    await expect(
      native.openNative({
        driverConfig: { server: "127.0.0.1", port: 1433, options: {} },
        target: "crashy,1433",
        attemptId: "crash-4",
        timeoutMs: 8_000,
        simulateCrash: true,
      }),
    ).rejects.toMatchObject({ code: "EDRIVER_CRASH_LOOP" });

    const blocked = native
      .diagnostics()
      .crashTargets.find((t: { target: string }) => t.target === "crashy,1433");
    expect(blocked?.blocked).toBe(true);

    // A manual retry clears the block, so an operator is never locked out.
    native.resetCrashState("crashy,1433");
    expect(
      native
        .diagnostics()
        .crashTargets.find((t: { target: string }) => t.target === "crashy,1433")?.blocked,
    ).not.toBe(true);
  }, 60_000);

  it("counts sessions that were killed without a clean logout", async () => {
    await native
      .openNative({
        driverConfig: { server: "10.255.255.1", port: 1433, options: {} },
        target: "10.255.255.1,1433",
        attemptId: "leaky",
        timeoutMs: 1_000,
        simulateHang: true,
      })
      .catch(() => null);
    const diag = native.diagnostics();
    expect(diag.sessions.orphaned).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
