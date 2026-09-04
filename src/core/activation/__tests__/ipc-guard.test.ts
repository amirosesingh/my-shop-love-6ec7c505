/**
 * Everything arriving from the window is untrusted. These check the argument
 * shapes the privileged desktop channels now insist on.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
type Guard = {
  writeOp: (v: unknown) => Record<string, unknown>;
  writeOps: (v: unknown) => unknown[];
  options: (v: unknown) => Record<string, unknown>;
  terminalConfig: (v: unknown) => Record<string, unknown> | null;
  guarded: (work: () => unknown) => Promise<unknown>;
};

const guard = require_("../../../../electron/ipc-guard.cjs") as Guard;

describe("desktop bridge argument checks", () => {
  it("accepts a normal write instruction", () => {
    expect(guard.writeOp({ kind: "upsert", table: "sales", rows: [{ id: "s1" }] })).toMatchObject({
      table: "sales",
    });
  });

  it("refuses an unknown write kind", () => {
    expect(() => guard.writeOp({ kind: "drop", table: "sales" })).toThrow(/kind is not recognised/);
  });

  it("refuses a table name that is not a plain identifier", () => {
    expect(() => guard.writeOp({ kind: "insert", table: "sales; drop table sales" })).toThrow();
  });

  it("caps the size of a batch", () => {
    const ops = Array.from({ length: 501 }, () => ({ kind: "insert", table: "sales", rows: [] }));
    expect(() => guard.writeOps(ops)).toThrow(/Too many entries/);
  });

  it("refuses nested structures inside maintenance options", () => {
    expect(guard.options({ retentionDays: 30, dryRun: true })).toEqual({
      retentionDays: 30,
      dryRun: true,
    });
    expect(() => guard.options({ where: { id: { $ne: null } } })).toThrow(/not in the expected form/);
  });

  it("insists an activation carries a terminal id, and allows clearing it", () => {
    expect(guard.terminalConfig(null)).toBeNull();
    expect(() => guard.terminalConfig({ locationId: "b1" })).toThrow(/terminal id is required/i);
    expect(guard.terminalConfig({ tokenId: "t1", locationId: "b1" })).toMatchObject({ tokenId: "t1" });
  });

  it("turns a bad argument into a clean refusal rather than a crash", async () => {
    const result = await guard.guarded(() => {
      guard.writeOp({ kind: "nope", table: "sales" });
      return { ok: true };
    });
    expect(result).toMatchObject({ ok: false, code: "EBADARG" });
  });
});
