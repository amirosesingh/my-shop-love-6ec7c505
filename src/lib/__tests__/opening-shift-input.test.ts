import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const openingSurfaces = [
  "src/routes/index.tsx",
  "src/routes/shifts.tsx",
  "src/platforms/web/components/pos/ShiftGuard.tsx",
];

describe("opening shift cash input", () => {
  for (const file of openingSurfaces) {
    it(`${file} starts empty and displays a money placeholder`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");

      expect(source).toContain('const [float, setFloat] = useState("");');
      expect(source).toContain('placeholder="0.00"');
      expect(source).not.toContain('const [float, setFloat] = useState("150");');
    });
  }
});
