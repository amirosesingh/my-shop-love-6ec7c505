import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `/api/public/sync` is a deprecated alias of `/api/v1/pos/sync`. Tills in the
 * field still call it, so it stays mounted — but it must never drift into a
 * second, weaker surface. Both routes have to delegate to the one handler.
 */
describe("sync route alias", () => {
  const alias = readFileSync("src/routes/api/public/sync.ts", "utf8");
  const canonical = readFileSync("src/routes/api/v1/pos/sync.ts", "utf8");

  it("both routes call the same handler", () => {
    for (const source of [alias, canonical]) {
      expect(source).toContain("@/lib/sync-endpoint.server");
      expect(source).toContain("handleSyncRequest(request)");
    }
  });

  it("the alias adds no handler of its own beyond POST", () => {
    expect(alias).not.toMatch(/\bGET:|\bPUT:|\bDELETE:|\bPATCH:/);
    expect(canonical).not.toMatch(/\bGET:|\bPUT:|\bDELETE:|\bPATCH:/);
  });
});
