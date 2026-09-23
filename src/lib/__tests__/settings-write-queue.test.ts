import { describe, expect, it, vi } from "vitest";
import { SettingsWriteQueue } from "../settings-write-queue";

describe("scoped settings writes", () => {
  it("serializes rapid writes to the same scope", async () => {
    const queue = new SettingsWriteQueue();
    const writes: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    queue.enqueue("BRANCH:1:printer", async () => { await gate; writes.push(1); });
    queue.enqueue("BRANCH:1:printer", async () => { writes.push(2); });
    expect(queue.pending).toBe(true);
    release();
    await queue.flush();
    expect(writes).toEqual([1, 2]);
    expect(queue.pending).toBe(false);
  });
  it("retries a failed write without redirecting it to global settings", async () => {
    const queue = new SettingsWriteQueue();
    const saveBranch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    queue.enqueue("BRANCH:1:printer", saveBranch);
    await queue.flush();
    expect(saveBranch).toHaveBeenCalledTimes(2);
    expect(queue.pending).toBe(false);
  });
  it("keeps failures visible when the retry is refused", async () => {
    const queue = new SettingsWriteQueue();
    queue.enqueue("BRANCH:1:printer", async () => { throw new Error("refused"); });
    await expect(queue.flush()).rejects.toThrow("refused");
    expect(queue.pending).toBe(true);
  });
});
