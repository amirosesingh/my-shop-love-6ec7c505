#!/usr/bin/env node
/**
 * Regenerates docs/audit/sync-coverage.md.
 *
 * The matrix is built from two sources that cannot drift from the running
 * app: the feature registry (what each feature says its data needs) and the
 * till's own sync lists in electron/db/repo.cjs (what actually happens).
 *
 * Run with bun so the TypeScript registry can be imported directly:
 *   bun scripts/sync-coverage.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "audit", "sync-coverage.md");

async function main() {
  let repo;
  let coverage;
  try {
    repo = require(path.join(ROOT, "electron", "db", "repo.cjs"));
    coverage = await import(path.join(ROOT, "src", "lib", "sync-coverage.ts"));
  } catch (err) {
    console.error(
      "Could not load the sync lists or the feature registry. Run this with bun:\n" +
        "  bun scripts/sync-coverage.cjs\n" +
        String(err && err.message ? err.message : err),
    );
    process.exit(1);
  }

  const name = (t) => (typeof t === "string" ? t : t && t.table);
  const contract = {
    push: repo.PUSH_TABLES.slice(),
    pull: [...repo.CATALOGUE_TABLES, ...repo.SCOPED_PULL_TABLES.map(name)].filter(Boolean),
    restore: repo.RESTORE_TABLES.map(name).filter(Boolean),
  };

  const rows = coverage.buildCoverage(contract);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, coverage.formatCoverage(rows), "utf8");

  const bad = coverage.mismatches(rows);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${rows.length} tables, ${bad.length} gap(s).`);
  for (const r of bad) console.log(`  ${r.table}: ${(r.issues || []).join(" ")}`);
}

main();
