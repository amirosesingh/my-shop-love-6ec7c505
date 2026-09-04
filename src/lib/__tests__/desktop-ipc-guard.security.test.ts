/**
 * Everything the window sends over the desktop bridge is untrusted input.
 * These checks are what stops a malformed argument from reaching a printer
 * command line, a file path or the local database.
 */
import { beforeAll, describe, expect, it } from "vitest";

type Guard = {
  BadArg: new (m: string) => Error;
  text: (v: unknown, o?: Record<string, unknown>) => string;
  shellSafeText: (v: unknown, o?: Record<string, unknown>) => string;
  plainObject: (v: unknown, o?: Record<string, unknown>) => Record<string, unknown>;
  list: (v: unknown, o?: Record<string, unknown>) => unknown[];
  bytes: (v: unknown, o?: Record<string, unknown>) => number[];
  key: (v: unknown, o?: Record<string, unknown>) => string;
  filePath: (v: unknown, o?: Record<string, unknown>) => string;
  guarded: (work: () => unknown) => Promise<unknown>;
};

let guard: Guard;

beforeAll(async () => {
  // @ts-expect-error - desktop shell module, plain CommonJS with no types
  guard = (await import("../../../electron/ipc-guard.cjs")) as unknown as Guard;
});

describe("desktop bridge arguments", () => {
  it("refuses printer names a Windows command line could reinterpret", () => {
    expect(guard.shellSafeText("EPSON TM-T82")).toBe("EPSON TM-T82");
    for (const bad of ['a" & calc', "a | calc", "a\r\ncalc", "a`calc`", "a$env:PATH", "a%PATH%"]) {
      expect(() => guard.shellSafeText(bad, { name: "printer name" })).toThrow();
    }
  });

  it("refuses print data that is not a real byte list", () => {
    expect(guard.bytes([27, 112, 0])).toEqual([27, 112, 0]);
    expect(guard.bytes(new Uint8Array([1, 2]))).toEqual([1, 2]);
    for (const bad of ["not bytes", [999], [-1], [null], { 0: 1 }]) {
      expect(() => guard.bytes(bad)).toThrow();
    }
    expect(() => guard.bytes(new Array(10).fill(0), { max: 5 })).toThrow();
  });

  it("refuses setting names that are paths or expressions", () => {
    expect(guard.key("cloud.url")).toBe("cloud.url");
    for (const bad of ["../../etc/passwd", "a b", "", "x".repeat(200), null, 7]) {
      expect(() => guard.key(bad)).toThrow();
    }
  });

  it("refuses backup destinations that are not plain local files", () => {
    expect(guard.filePath("C:\\backups\\pos.bak", { extension: "bak" })).toBe("C:\\backups\\pos.bak");
    for (const bad of [
      "\\\\attacker\\share\\pos.bak",
      "pos.bak",
      "C:\\backups\\pos.exe",
      'C:\\backups\\a" & calc.bak',
    ]) {
      expect(() => guard.filePath(bad, { name: "backup file", extension: "bak" })).toThrow();
    }
  });

  it("caps list sizes and refuses shapes that are not records", () => {
    expect(guard.list([1, 2], { max: 5 })).toEqual([1, 2]);
    expect(() => guard.list([1, 2, 3], { max: 2 })).toThrow();
    expect(() => guard.list("rows")).toThrow();
    expect(guard.plainObject(undefined)).toEqual({});
    expect(() => guard.plainObject([1, 2])).toThrow();
  });

  it("turns a rejected argument into a plain refusal, not a crash", async () => {
    const result = (await guard.guarded(() => guard.key("../secret"))) as {
      ok: boolean;
      code: string;
      error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("EBADARG");
    expect(result.error).toContain("not allowed");
  });
});
