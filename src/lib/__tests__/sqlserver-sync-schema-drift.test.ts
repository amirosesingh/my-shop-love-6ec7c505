import { describe, expect, it } from "vitest";

describe("SQL Server sync schema drift guards", () => {
  it("does not hardcode created_at for every pending table", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("electron/db/repo.cjs", "utf8");

    expect(source).toContain('known.has("created_at")');
    expect(source).toContain('known.has("updated_at")');
    expect(source).toContain('ORDER BY [${orderColumn}] ASC');
  });
});
