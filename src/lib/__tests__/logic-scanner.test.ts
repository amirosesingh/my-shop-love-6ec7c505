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
    const found = blocks(
      "async function inner() { await save(); } async function outer() { try { await inner(); } catch (e) { alert(e); } }",
    );
    expect(found.find((entry: { name: string }) => entry.name === "inner").handled).toBe(true);
  });
  it("excludes nested test directories", () => {
    expect(walk(resolve("src")).some((file: string) => file.includes("__tests__"))).toBe(false);
  });
  it("does not label native bridge detection as placeholder code", () => {
    expect(
      scanFile(resolve("src/platforms/mobile/native-http.ts")).filter(
        (finding: { rule: string }) => finding.rule === "Placeholder logic",
      ),
    ).toEqual([]);
  });
  it("recognizes explicit parseInt radices and guarded numeric inputs", () => {
    for (const file of [
      "src/lib/accent.ts",
      "src/lib/bundle-epoch.ts",
      "src/lib/offline-credentials.ts",
      "src/lib/theme.tsx",
      "src/platforms/web/components/pos/ReceiptPrinterSettings.tsx",
      "src/routes/promotions.tsx",
      "src/routes/settings.sku.tsx",
    ]) {
      expect(
        scanFile(resolve(file)).filter(
          (finding: { rule: string }) =>
            finding.rule === "parseInt without a radix" ||
            finding.rule === "Unvalidated number input",
        ),
        file,
      ).toEqual([]);
    }
  });
  it("does not mistake phone-number state setters for numeric conversion", () => {
    for (const file of ["src/routes/index.tsx", "src/routes/settings.notifications.tsx"]) {
      expect(
        scanFile(resolve(file)).filter(
          (finding: { rule: string }) => finding.rule === "Unvalidated number input",
        ),
        file,
      ).toEqual([]);
    }
  });
});
