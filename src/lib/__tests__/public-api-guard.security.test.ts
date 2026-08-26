import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Everything under /api/public/* answers without a signed-in session, so each
 * handler must name the guard it relies on — a real check, or an explicit
 * "this is deliberately open" marker. This test fails the build if a new
 * endpoint ships without one, which is the whole point of the shared guard.
 */
const DIR = join(process.cwd(), "src/routes/api/public");

const GUARDS = [
  "verifyHmacSignature",
  "verifySharedSecret",
  "publiclyReadable",
  "callerVerifiedDownstream",
];

describe("public API endpoints", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

  it("has endpoints to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s names a guard from the shared module", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src).toContain("@/lib/public-api-guard.server");
    expect(GUARDS.some((g) => src.includes(g))).toBe(true);
  });
});
