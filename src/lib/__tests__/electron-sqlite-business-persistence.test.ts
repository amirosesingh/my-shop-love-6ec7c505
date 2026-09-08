import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("Electron durable business persistence", () => {
  it("makes the atomic SQLite copy the first mandatory desktop commit boundary", () => {
  it("does not report a committed SQL transaction as failed when its SQLite projection fails", () => {
  it("atomically shadows related transaction rows in embedded SQLite", () => {
    const sqlite = read("electron/db/sqlite.cjs");
    const gateway = read("src/core/api/pos-db.ts");
    expect(sqlite).toContain("function mirrorBatch(entries)");
    expect(sqlite).toContain("return tx(() =>");
    expect(sqlite).toContain("INSERT INTO mirror (entity, id, payload, updated_at)");
    expect(sqlite).toContain('INSERT INTO "${entity}"');
    expect(gateway).toContain("bridge.localMirrorBatch(mirrorEntries)");
    expect(gateway).toContain("This desktop build cannot commit an atomic SQLite batch");
    expect(gateway.indexOf("await bridge.localMirrorBatch(mirrorEntries)")).toBeLessThan(
      gateway.indexOf("await bridge.writeBatch(context, ops)"),
    );
    expect(gateway).toContain('entity: "sqlite_business_batch"');
    expect(gateway).not.toContain(
      'throw new Error(shadow.error ?? "The embedded SQLite transaction copy was incomplete")',
    );
    expect(gateway).toContain("embedded SQLite transaction copy was incomplete");
  });

  it("keeps the desktop state projection and cloud snapshot out of localStorage", () => {
    const store = read("src/lib/pos-store.tsx");
    const snapshot = read("src/lib/offline-snapshot.ts");
    expect(store).not.toContain("window.localStorage.getItem(KEY)");
    expect(store).not.toContain("schedulePersist(KEY");
    expect(snapshot).not.toContain("window.localStorage");
    expect(snapshot).toContain("getSetting?.(KEY)");
    expect(snapshot).toContain("setSetting?.(KEY");
  });

  it("rebuilds offline sale headers and items from the SQLite recovery copy", () => {
    const gateway = read("src/core/api/pos-db.ts");
    expect(gateway).toContain('bridge.localList("sales", 5000)');
    expect(gateway).toContain('bridge.localList("sale_items", 20000)');
    expect(gateway).toContain("sales: localSales.map(rowToSale)");
  });
});
