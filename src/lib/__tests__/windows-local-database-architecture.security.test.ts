import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const productionRoots = [join(root, "electron"), join(root, "src", "platforms", "windows")];

function files(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : /\.(?:cjs|mjs|js|ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const sources = productionRoots.flatMap(files).map((path) => ({
  path: relative(root, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

describe("Windows local database architecture guard", () => {
  it("contains no SQLite implementation or packaging", () => {
    const forbidden = [/node:sqlite/i, /better-sqlite3/i, /\.db-(?:wal|shm)\b/i, /pos-local\.db/i];
    expect(sources.filter(({ text }) => forbidden.some((rule) => rule.test(text))).map(({ path }) => path)).toEqual([]);
  });

  it("contains no SQL Browser, UDP 1434, named-instance, or network scanning implementation", () => {
    const forbidden = [/udp\s*1434/i, /sql\s*server\s*browser/i, /server\\\\instance/i, /scanLocalInstances/i, /scanNetwork/i];
    expect(sources.filter(({ text }) => forbidden.some((rule) => rule.test(text))).map(({ path }) => path)).toEqual([]);
  });

  it("does not persist Windows business data in browser storage", () => {
    const businessStorage = /(?:localStorage|indexedDB).*(?:sales?|payments?|refunds?|stock|products?|members?|bookings?|shifts?|purchases?)/i;
    expect(sources.filter(({ text }) => businessStorage.test(text)).map(({ path }) => path)).toEqual([]);
  });
});
