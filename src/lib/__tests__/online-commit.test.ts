/**
 * Online working must never make a sale wait on the local database.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const live = vi.fn();
const localWrite = vi.fn();

vi.mock("@/lib/sync-engine", () => ({
  runOpLive: (...a: unknown[]) => live(...a),
  drainOutbox: async () => {},
}));
vi.mock("@/lib/local-db", () => ({
  localDb: () => ({ write: (...a: unknown[]) => localWrite(...a) }),
  electronDb: () => null,
  readBranch: () => ({ branchId: null, branchName: null }),
}));

import { commitOps } from "@/lib/pos-db";
import { setPreferredDatabaseMode } from "@/lib/db-mode";

const ops = [{ kind: "insert", table: "sales", rows: [{ id: "s1" }] }] as never;

describe("commitOps in online mode with a local database present", () => {
  beforeEach(() => {
    live.mockReset();
    localWrite.mockReset();
    setPreferredDatabaseMode("online");
  });
  afterEach(() => setPreferredDatabaseMode("local"));

  it("finishes the sale on the cloud even when the local copy fails", async () => {
    live.mockResolvedValue(undefined);
    localWrite.mockRejectedValue(new Error("local SQL unavailable"));
    await expect(commitOps("Saving sale", ops)).resolves.toBe("cloud");
    expect(live).toHaveBeenCalled();
  });

  it("falls back to the terminal when the line is down", async () => {
    live.mockRejectedValue(new Error("Failed to fetch"));
    localWrite.mockResolvedValue({ ok: true });
    await expect(commitOps("Saving sale", ops)).resolves.toBe("local");
  });

  it("stops the action when neither database will take it", async () => {
    live.mockRejectedValue(new Error("Failed to fetch"));
    localWrite.mockResolvedValue({ ok: false, error: "no local engine" });
    await expect(commitOps("Saving sale", ops)).rejects.toThrow(/Database Connection Required/);
  });
});
