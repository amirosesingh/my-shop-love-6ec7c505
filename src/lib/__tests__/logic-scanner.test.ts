import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { blocks, scanFile, walk } = require("../../../scripts/logic-scan.cjs");
describe("logic scanner boundaries", () => {
  it("does not absorb the next function into an expression-bodied helper", () => {
    const found = blocks("const value = () => 1; async function run() { await save(); }");
    expect(found.map((entry: { name: string }) => entry.name)).toEqual(["run"]);
  });
  it("recognizes awaited helpers whose callers catch failures", () => {
    const found = blocks("async function inner() { await save(); } async function outer() { try { await inner(); } catch (e) { alert(e); } }");
    expect(found.find((entry: { name: string }) => entry.name === "inner").handled).toBe(true);
  });
  it("excludes nested test directories", () => {
    expect(walk(resolve("src")).some((file: string) => file.includes("__tests__"))).toBe(false);
  });
  it("does not label native bridge detection as placeholder code", () => {
    expect(scanFile(resolve("src/platforms/mobile/native-http.ts")).filter((finding: { rule: string }) => finding.rule === "Placeholder logic")).toEqual([]);
  });
});
