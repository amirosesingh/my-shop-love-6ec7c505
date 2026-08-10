/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../terminal-tokens", () => ({ readTerminalConfig: () => null }));
vi.mock("../local-db", () => ({ readBranch: () => ({ branchId: null, branchName: null }) }));

import { activeBranchId, bindTerminalBranch, setKnownBranches } from "../active-branch";
import { describeError } from "../notify";

describe("terminal branch binding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setKnownBranches([]);
  });

  it("keeps the bound branch across reads once it is set", () => {
    bindTerminalBranch("branch-1", "Main Street");
    expect(activeBranchId(null)).toBe("branch-1");
  });

  it("uses the only branch that exists when nothing is bound", () => {
    setKnownBranches(["only-branch"]);
    expect(activeBranchId(null)).toBe("only-branch");
  });
});

describe("error messages", () => {
  it("explains a foreign key block in plain words", () => {
    const message = describeError(
      { code: "23503", message: 'violates foreign key constraint "sale_items_product_id_fkey"' },
      "Deleting this product",
    );
    expect(message).toContain("other records still point at this entry");
  });

  it("says an offline action was queued", () => {
    expect(describeError(new Error("Failed to fetch"), "Saving the sale")).toContain("sync");
  });
});