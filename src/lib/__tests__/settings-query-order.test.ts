import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/core/api/db-router", () => ({
  dbRouter: { query },
}));

import { loadBranchSettings } from "../branch-settings";

describe("scoped settings reads", () => {
  beforeEach(() => query.mockReset().mockResolvedValue([]));

  it("orders composite-key settings tables by section instead of a missing id column", async () => {
    await loadBranchSettings({ CLUSTER: "361-degree", BRANCH: "branch-1", PRIVATE: "user-1" });

    expect(query).toHaveBeenCalledTimes(4);
    for (const [, options] of query.mock.calls) {
      expect(options.orderBy).toEqual({ column: "section", ascending: true });
    }
  });
});
