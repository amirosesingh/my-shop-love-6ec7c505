/**
 * Connection diagnostics: the paths behind the three reported errors.
 *
 * 1. A schema answer that is not a list must read as "nothing known", not
 *    throw "… is not iterable" in the middle of a health check.
 * 2. The device relay path must stay under the publicly reachable prefix.
 * 3. The canonical relay route must carry cross-origin headers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { actualFromRows, computeCentralDrift } from "../central-drift";

describe("schema drift input hardening", () => {
  it("treats a non-list answer as an empty schema", () => {
    for (const bad of [undefined, null, {}, "rows", 7]) {
      const map = actualFromRows(bad as never);
      expect(map.size).toBe(0);
      expect(() => computeCentralDrift(map)).not.toThrow();
    }
  });

  it("skips malformed rows instead of failing the whole report", () => {
    const map = actualFromRows([
      null,
      { table: "", column: "id" },
      { table: "sales", column: "id", type: "uuid", format: "uuid" },
    ] as never);
    expect(map.size).toBe(1);
    expect(map.get("sales")?.get("id")?.format).toBe("uuid");
  });
});

describe("relay reachability", () => {
  const relayClient = readFileSync("src/core/api/sync-relay.ts", "utf8");
  const v1Route = readFileSync("src/routes/api/v1/pos/sync.ts", "utf8");

  it("sends device calls to the publicly reachable alias", () => {
    expect(relayClient).toMatch(/serverOrigin\(\) \? "\/api\/public\/sync" : "\/api\/v1\/pos\/sync"/);
  });

  it("gives the canonical relay route cross-origin headers and a preflight", () => {
    expect(v1Route).toContain("withCors");
    expect(v1Route).toContain("OPTIONS");
  });
});
