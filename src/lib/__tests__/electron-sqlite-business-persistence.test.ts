import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("Electron durable business persistence", () => {
  it("makes the atomic SQLite copy the first mandatory desktop commit boundary", () => {
    const sqlite = read("electron/db/sqlite.cjs");
    const gateway = read("src/core/api/pos-db.ts");
    expect(sqlite).toContain("function mirrorBatch(entries)");
    expect(sqlite).toContain("return tx(() =>");
    expect(sqlite).toContain("INSERT INTO mirror (entity, id, payload, updated_at)");
    expect(sqlite).toContain('INSERT INTO "${entity}"');
    expect(sqlite).toContain("function pendingBusinessBatches(limit = 25)");
    expect(sqlite).toContain("function acknowledgeBusinessBatch(id)");
    expect(gateway).toContain("bridge.localMirrorBatch(mirrorEntries, ops)");
    expect(gateway).toContain("This desktop build cannot commit an atomic SQLite batch");
    expect(gateway.indexOf("await bridge.localMirrorBatch(mirrorEntries, ops)")).toBeLessThan(
      gateway.indexOf("await bridge.writeBatch(context, ops)"),
    );
  });

  it("drains and acknowledges the SQLite outbox before the legacy SQL queue", () => {
    const worker = read("electron/sync/worker.cjs");
    expect(worker).toContain("async function pushSqliteBusinessBatches()");
    expect(worker).toContain("sqlite.acknowledgeBusinessBatch(batch.id)");
    expect(worker).toContain("async function cloudMutation(op)");
    expect(worker.indexOf("await pushSqliteBusinessBatches()")).toBeLessThan(
      worker.indexOf("for (const table of repo.PUSH_TABLES"),
    );
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
