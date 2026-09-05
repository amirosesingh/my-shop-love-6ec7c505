import { beforeEach, describe, expect, it } from "vitest";

import { agoWords, lastSyncAck, noteSyncAck, queueFailureKind, summarise } from "@/lib/sync-summary";
import type { QueueView } from "@/lib/sync-outbox";

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as { window?: unknown }).window = { localStorage: storage };
(globalThis as { localStorage?: unknown }).localStorage = storage;

const row = (over: Partial<QueueView>): QueueView =>
  ({
    id: "1",
    context: "Sale",
    op: { kind: "insert", table: "sales", rows: [] },
    createdAt: "2026-01-01T10:00:00.000Z",
    occurredAt: "2026-01-01T10:00:00.000Z",
    attempts: 0,
    state: "waiting",
    reason: null,
    nextAttemptAt: null,
    branchId: null,
    terminalId: null,
    ...over,
  }) as unknown as QueueView;

describe("sync summary", () => {
  beforeEach(() => window.localStorage.clear());

  it("counts waiting and refused changes apart", () => {
    const s = summarise([
      row({ id: "a" }),
      row({ id: "b", occurredAt: "2026-01-01T09:00:00.000Z" }),
      row({ id: "c", state: "refused", reason: "duplicate key value violates" }),
    ]);
    expect(s.pending).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.oldestPendingAt).toBe("2026-01-01T09:00:00.000Z");
  });

  it("buckets the reason a change is stuck", () => {
    expect(queueFailureKind(row({ reason: null }))).toBeNull();
    expect(queueFailureKind(row({ reason: "Failed to fetch" }))).toBe("network");
  });

  it("remembers the last acknowledgement from the central database", () => {
    expect(lastSyncAck()).toBeNull();
    noteSyncAck("2026-01-01T10:00:00.000Z");
    expect(lastSyncAck()).toBe("2026-01-01T10:00:00.000Z");
    expect(summarise([]).lastAckAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("describes ages in plain words", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    expect(agoWords(null, now)).toBe("");
    expect(agoWords("2026-01-01T11:59:30.000Z", now)).toBe("just now");
    expect(agoWords("2026-01-01T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(agoWords("2025-12-30T12:00:00.000Z", now)).toBe("2 days ago");
  });
});
