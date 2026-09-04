/**
 * Upgrading the till's own database must never cost a sale.
 *
 * The upgrade runs on a real SQLite file: rows are written with the old shape,
 * the upgrade runs, and the rows must still be there with the new columns
 * added. The interrupted case matters most — the version stamp is written only
 * after the work finishes, so a till switched off part-way simply upgrades
 * again next time instead of coming up half-built.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type Row = Record<string, unknown>;
type Db = {
  exec: (sql: string) => void;
  prepare: (sql: string) => { all: (...a: unknown[]) => Row[]; get: (...a: unknown[]) => Row | undefined; run: (...a: unknown[]) => unknown };
  close: () => void;
};

let sqlite: { DatabaseSync: new (p: string) => Db } | null = null;
try {
  sqlite = (await import("node:sqlite")) as unknown as { DatabaseSync: new (p: string) => Db };
} catch {
  sqlite = null;
}

const dirs: string[] = [];
const newDir = () => {
  const d = mkdtempSync(join(tmpdir(), "pos-schema-"));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The additive upgrade this build performs, in the same order as the shell. */
const EXPECTED_VERSION = 6;

function columns(db: Db, table: string) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name)));
}

function upgrade(db: Db) {
  const have = columns(db, "sales");
  const add = (name: string, ddl: string) => {
    if (!have.has(name)) db.exec(`ALTER TABLE sales ADD COLUMN ${name} ${ddl}`);
  };
  add("is_synced", "INTEGER NOT NULL DEFAULT 0");
  add("sync_status", "TEXT NOT NULL DEFAULT 'PENDING'");
  add("row_version", "INTEGER NOT NULL DEFAULT 1");
}

const run = sqlite ? describe : describe.skip;

run("local database upgrade", () => {
  it("keeps every sale and adds the missing columns", () => {
    const db = new sqlite!.DatabaseSync(join(newDir(), "pos.db"));
    db.exec(`CREATE TABLE sales (id TEXT PRIMARY KEY, total REAL NOT NULL)`);
    db.exec(`INSERT INTO sales (id, total) VALUES ('s1', 12.5), ('s2', 4)`);

    upgrade(db);
    db.exec(`PRAGMA user_version = ${EXPECTED_VERSION}`);

    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(2);
    expect(db.prepare("SELECT total FROM sales WHERE id = 's1'").get()?.total).toBe(12.5);
    expect(columns(db, "sales").has("sync_status")).toBe(true);
    // Queued rows keep their unsent state rather than being marked as sent.
    expect(db.prepare("SELECT sync_status FROM sales WHERE id = 's1'").get()?.sync_status).toBe(
      "PENDING",
    );
    db.close();
  });

  it("runs the upgrade again after the till was switched off part-way", () => {
    const path = join(newDir(), "pos.db");
    const first = new sqlite!.DatabaseSync(path);
    first.exec(`CREATE TABLE sales (id TEXT PRIMARY KEY, total REAL NOT NULL)`);
    first.exec(`INSERT INTO sales (id, total) VALUES ('s1', 9)`);
    // Power cut: the first column landed, the version stamp never did.
    first.exec(`ALTER TABLE sales ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0`);
    first.close();

    const second = new sqlite!.DatabaseSync(path);
    expect(Number(second.prepare("PRAGMA user_version").get()?.user_version ?? 0)).toBe(0);
    upgrade(second);
    second.exec(`PRAGMA user_version = ${EXPECTED_VERSION}`);

    expect(columns(second, "sales").has("row_version")).toBe(true);
    expect(second.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(1);
    expect(Number(second.prepare("PRAGMA user_version").get()?.user_version)).toBe(
      EXPECTED_VERSION,
    );
    second.close();
  });

  it("does nothing on a database that is already current", () => {
    const db = new sqlite!.DatabaseSync(join(newDir(), "pos.db"));
    db.exec(`CREATE TABLE sales (id TEXT PRIMARY KEY, total REAL NOT NULL,
             is_synced INTEGER NOT NULL DEFAULT 0,
             sync_status TEXT NOT NULL DEFAULT 'PENDING',
             row_version INTEGER NOT NULL DEFAULT 1)`);
    db.exec(`INSERT INTO sales (id, total) VALUES ('s1', 3)`);
    db.exec(`PRAGMA user_version = ${EXPECTED_VERSION}`);
    const before = columns(db, "sales").size;
    upgrade(db);
    expect(columns(db, "sales").size).toBe(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(1);
    db.close();
  });
});
