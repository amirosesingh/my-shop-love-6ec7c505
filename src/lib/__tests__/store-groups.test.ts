import { describe, expect, it } from "vitest";

import { groupName, groupCodeFrom, selectableGroups, type StoreGroup } from "@/lib/store-groups";

const g = (over: Partial<StoreGroup>): StoreGroup => ({
  id: "apparel",
  code: "APPAREL",
  name: "Apparel Group",
  isActive: true,
  archivedAt: null,
  ...over,
});

describe("store groups", () => {
  it("only offers active, unarchived groups for assignment", () => {
    const list = [
      g({}),
      g({ id: "trophy", code: "TROPHY", name: "Trophy Group" }),
      g({ id: "old", code: "OLD", name: "Retired", isActive: false }),
      g({ id: "gone", code: "GONE", name: "Archived", archivedAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(selectableGroups(list).map((x) => x.id)).toEqual(["apparel", "trophy"]);
  });

  it("resolves a branch's group id to its name, and falls back to the id", () => {
    const list = [g({})];
    expect(groupName(list, "apparel")).toBe("Apparel Group");
    expect(groupName(list, "unknown")).toBe("unknown");
    expect(groupName(list, null)).toBe("");
  });

  it("derives a unique code from the name", () => {
    const list = [g({ code: "TROPHY" })];
    expect(groupCodeFrom("Trophy Group", [])).toBe("TROPHYGROU");
    expect(groupCodeFrom("Trophy", list)).toBe("TROPHY2");
    expect(groupCodeFrom("!!", [])).toBe("GROUP");
  });
});
