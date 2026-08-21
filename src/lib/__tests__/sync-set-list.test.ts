import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildSetList } = require("../../../electron/db/repo.cjs") as {
  buildSetList: (
    columns: string[],
    opts: { markPending: boolean; hasRowVersion: boolean },
  ) => string;
};

const assignmentsFor = (setList: string, column: string) =>
  setList.split(", ").filter((part) => part.startsWith(`t.[${column}] =`));

describe("buildSetList", () => {
  it("never assigns updated_at twice when a cloud row carries its own", () => {
    const setList = buildSetList(["id", "name", "updated_at", "row_version"], {
      markPending: false,
      hasRowVersion: true,
    });
    expect(assignmentsFor(setList, "updated_at")).toEqual(["t.[updated_at] = s.[updated_at]"]);
  });

  it("stamps the local clock when pulling a row without updated_at", () => {
    const setList = buildSetList(["id", "name"], { markPending: false, hasRowVersion: false });
    expect(assignmentsFor(setList, "updated_at")).toEqual([
      "t.[updated_at] = SYSUTCDATETIME()",
    ]);
  });

  it("stamps the local clock on a local edit and drops the incoming value", () => {
    const setList = buildSetList(["id", "name", "updated_at"], {
      markPending: true,
      hasRowVersion: true,
    });
    expect(assignmentsFor(setList, "updated_at")).toEqual([
      "t.[updated_at] = SYSUTCDATETIME()",
    ]);
    expect(setList).toContain("t.[is_synced] = 0");
    expect(setList).toContain("t.[row_version] = ISNULL(t.[row_version], 0) + 1");
  });

  it("assigns every column at most once", () => {
    const columns = ["id", "name", "updated_at", "row_version", "price"];
    for (const markPending of [true, false]) {
      const parts = buildSetList(columns, { markPending, hasRowVersion: true }).split(", ");
      const names = parts.map((p) => p.slice(0, p.indexOf("]") + 1));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("never writes to the primary key", () => {
    const setList = buildSetList(["id", "name"], { markPending: true, hasRowVersion: false });
    expect(setList).not.toContain("t.[id]");
  });
});
