#!/usr/bin/env node
/*
  Builds db/offline/pos-offline-sqlserver.sql — the file a technician runs by
  hand on a till PC — from three pieces:

    db/offline/parts/00-bootstrap.sql   create the database, login and user
    database/schema.sql                 the master table set the app applies
    db/offline/parts/90-local-only.sql  tables that exist only on the till

  Keeping it generated means the hand-run file can never fall behind the
  master again. Run: node scripts/build-offline-sql.cjs   (--check to verify)
*/
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const OUT = "db/offline/pos-offline-sqlserver.sql";

function build() {
  const bootstrap = read("db/offline/parts/00-bootstrap.sql").trimEnd();
  const master = read("database/schema.sql").trimEnd();
  const local = read("db/offline/parts/90-local-only.sql").trimEnd();
  return [
    bootstrap,
    "",
    master,
    "",
    "/* ---- tables that live only on the till ---- */",
    "",
    local,
    "",
  ].join("\n");
}

function main() {
  const next = build();
  if (process.argv.includes("--check")) {
    if (read(OUT) !== next) {
      console.error(
        `${OUT} is out of date with database/schema.sql.\n` +
          "Run: node scripts/build-offline-sql.cjs",
      );
      process.exit(1);
    }
    console.log(`${OUT} is up to date.`);
    return;
  }
  writeFileSync(resolve(root, OUT), next);
  const tables = new Set([...next.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((m) => m[1]));
  console.log(`Wrote ${OUT} — ${tables.size} tables.`);
}

if (require.main === module) main();

module.exports = { build };

