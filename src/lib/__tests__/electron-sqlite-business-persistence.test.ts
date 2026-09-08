import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("Electron durable business persistence", () => {
  it("makes the atomic SQLite copy the first mandatory desktop commit boundary", () => {
    const sqlite = read("electron/db/sqlite.cjs");
    const gateway = read("src/core/api/pos-db.ts");
    expect(sqlite).toContain("function mirrorBatch(entries, operations)");
    expect(sqlite).toContain("return tx(() =>");
    expect(sqlite).toContain("INSERT INTO mirror (entity, id, payload, updated_at)");
    expect(sqlite).toContain('INSERT INTO "${entity}"');
    expect(sqlite).toContain("function pendingBusinessBatches(limit = 25)");
    expect(sqlite).toContain("function acknowledgeBusinessBatch(id)");
    expect(sqlite).not.toContain('.filter((op) => op?.table !== "pos_store_settings")');
    expect(gateway).toContain("bridge.localMirrorBatch(mirrorEntries, ops)");
    expect(gateway).toContain("This desktop build cannot commit an atomic SQLite batch");
    expect(gateway.indexOf("await bridge.localMirrorBatch(mirrorEntries, ops)")).toBeLessThan(
      gateway.indexOf("await bridge.writeBatch(context, ops)"),
    );
    expect(gateway).toContain('kind: "compatibility_projection_failed"');
    expect(gateway).toContain('return noteCommitTarget("local")');
  });

  it("drains and acknowledges the SQLite outbox before the legacy SQL queue", () => {
    const worker = read("electron/sync/worker.cjs");
    expect(worker).toContain("async function pushSqliteBusinessBatches()");
    expect(worker).toContain("sqlite.acknowledgeBusinessBatch(batch.id)");
    expect(worker).toContain("async function cloudMutation(op)");
    expect(worker).toContain("await repo.applyOps(projectionOps)");
    expect(worker.indexOf("await repo.applyOps(projectionOps)")).toBeLessThan(
      worker.indexOf("sqlite.acknowledgeBusinessBatch(batch.id)"),
    );
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

  it("stores operational browser-facing state in SQLite on Electron", () => {
    const main = read("electron/main.cjs");
    const preload = read("electron/preload.cjs");
    const operational = [
      "src/lib/sync-outbox.ts",
      "src/lib/held-orders.ts",
      "src/lib/shift-sessions.ts",
      "src/lib/drawer-events.ts",
      "src/lib/stock-recovery.ts",
    ].map(read);
    expect(main).toContain('ipcMain.on("local:business-get"');
    expect(main).toContain('ipcMain.on("local:business-set"');
    expect(preload).toContain('ipcRenderer.sendSync("local:business-get"');
    expect(preload).toContain('ipcRenderer.sendSync("local:business-set"');
    for (const source of operational) {
      expect(source).toContain("BusinessValue");
      expect(source).not.toContain("window.localStorage.getItem(KEY)");
      expect(source).not.toContain("window.localStorage.setItem(KEY");
    }
  });

  it("routes Electron business writers through the atomic commit gateway", () => {
    const gateway = read("src/core/api/pos-db.ts");
    const signIns = read("src/lib/offline-sign-ins.ts");
    const suppliers = read("src/lib/suppliers.ts");
    const shiftClose = read("src/lib/shift-closing.ts");
    expect(gateway).toContain("void commitOps(context, [op])");
    expect(signIns).toContain('await commitOps("cashier-login"');
    expect(suppliers).toContain('await commitOps("Saving supplier"');
    expect(shiftClose).toContain('await commitOps("Cash count (waiting for the line)"');
  });
});
