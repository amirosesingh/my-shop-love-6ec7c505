import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("Electron durable business persistence", () => {
  it("does not report a committed SQL transaction as failed when its SQLite projection fails", () => {
  it("atomically shadows related transaction rows in embedded SQLite", () => {
    const sqlite = read("electron/db/sqlite.cjs");
    const gateway = read("src/core/api/pos-db.ts");
    expect(sqlite).toContain("function mirrorBatch(entries)");
    expect(sqlite).toContain("return tx(() =>");
    expect(sqlite).toContain("INSERT INTO mirror (entity, id, payload, updated_at)");
    expect(gateway).toContain("bridge.localMirrorBatch(mirrorEntries)");
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
});
