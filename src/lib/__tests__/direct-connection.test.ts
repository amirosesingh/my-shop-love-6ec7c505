import { describe, expect, it, vi } from "vitest";

/**
 * The till hung for 40 seconds whenever a named instance was typed together
 * with a real port: the port was thrown away and the SQL Server Browser
 * (UDP 1434) was asked to rediscover something the operator had already told
 * us. These tests pin the corrected behaviour.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pool = require("../../../electron/db/pool.cjs");

/** Mirrors the wizard's resolvedPort(): an explicit port always wins. */
function resolvedPort(server: string, port: number): number | undefined {
  const inline = /,\s*(\d+)\s*$/.exec(server);
  if (inline) return Number(inline[1]);
  return port || undefined;
}

describe("explicit port on a named instance", () => {
  it("keeps 1433 for localhost\\SQLEXPRESS instead of dropping it", () => {
    expect(resolvedPort("localhost\\SQLEXPRESS", 1433)).toBe(1433);
  });

  it("reads the port out of the inline host,port form", () => {
    expect(resolvedPort("localhost\\SQLEXPRESS,1433", 0)).toBe(1433);
  });

  it("still reports automatic when no port was supplied", () => {
    expect(resolvedPort("localhost\\SQLEXPRESS", 0)).toBeUndefined();
  });

  it("resolves localhost\\SQLEXPRESS,1433 to a direct TCP target", async () => {
    const spy = vi.spyOn(require("../../../electron/db/discover.cjs"), "instancePort");
    const target = await pool.resolveTarget({
      server: "localhost\\SQLEXPRESS,1433",
      port: 1433,
    });
    expect(target.port).toBe(1433);
    expect(target.portKnown).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("direct connection mode", () => {
  it("is recognised from the config flag", () => {
    expect(pool.isDirectConnect({ directConnect: true })).toBe(true);
    expect(pool.isDirectConnect({ directConnect: false })).toBe(false);
    expect(pool.isDirectConnect({})).toBe(false);
  });

  it("never performs a SQL Browser lookup and drops the instance name", async () => {
    const spy = vi.spyOn(require("../../../electron/db/discover.cjs"), "instancePort");
    const target = await pool.resolveTarget({
      server: "localhost\\SQLEXPRESS",
      port: 1433,
      directConnect: true,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(target.instanceName).toBe("");
    expect(target.port).toBe(1433);
    expect(target.direct).toBe(true);
    spy.mockRestore();
  });

  it("fails fast rather than spending the discovery budget", () => {
    expect(pool.DIRECT_BUDGET_MS).toBeLessThan(20_000);
  });
});
