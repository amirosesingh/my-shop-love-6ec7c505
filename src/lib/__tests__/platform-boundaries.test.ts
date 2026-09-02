/**
 * Folder boundaries for the platform split.
 *
 * The point of /core + /platforms is that a platform can be changed or removed
 * without touching the other two. These checks fail the build if that erodes:
 * only Windows may reach the local SQL layer, and shared code must not import
 * a platform folder.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)].map(
    (m) => m[1] ?? m[2] ?? "",
  );
}

describe("platform folder boundaries", () => {
  it("mobile code never reaches the local SQL layer", () => {
    const offenders = walk(join(root, "platforms", "mobile")).filter((f) =>
      importsOf(f).some((i) => i.includes("core/local-db")),
    );
    expect(offenders).toEqual([]);
  });

  it("core never imports a platform folder", () => {
    const offenders = walk(join(root, "core")).filter((f) =>
      importsOf(f).some((i) => i.includes("@/platforms/")),
    );
    expect(offenders).toEqual([]);
  });

  it("one platform never imports another platform's folder", () => {
    const bad: string[] = [];
    for (const platform of ["mobile", "windows"]) {
      let files: string[];
      try {
        files = walk(join(root, "platforms", platform));
      } catch {
        continue;
      }
      for (const file of files) {
        for (const spec of importsOf(file)) {
          const other = spec.match(/@\/platforms\/(\w+)/)?.[1];
          if (other && other !== platform) bad.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("raw shell detection stays inside platform-config and the platform folders", () => {
    const allowed = [join(root, "platform-config"), join(root, "platforms")];
    const offenders = walk(root)
      .filter((f) => !allowed.some((a) => f.startsWith(a)) && !f.includes("__tests__"))
      .filter((f) => /\bisElectron\b|\bisNative\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
