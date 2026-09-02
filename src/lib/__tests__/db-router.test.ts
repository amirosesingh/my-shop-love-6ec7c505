import { describe, expect, it, beforeEach } from "vitest";
import { AllTargetsFailed, isCloudDirect, setCloudDirect, databaseModeLabel } from "@/core/local-db/db-mode";
import { dbProxy, dbRouter } from "@/core/api/db-router";

describe("dbRouter", () => {
  beforeEach(() => setCloudDirect(false));

  it("reports cloud-direct working in the status label", () => {
    expect(isCloudDirect()).toBe(false);
    setCloudDirect(true);
    expect(databaseModeLabel()).toBe("Cloud direct");
  });

  it("falls back to the local copy when a read cannot reach the server", async () => {
    const value = await dbRouter.read(
      async () => {
        throw new Error("Failed to fetch");
      },
      () => ["cached"],
    );
    expect(value).toEqual(["cached"]);
  });

  it("passes a rule refusal straight through instead of falling back", async () => {
    await expect(
      dbRouter.read(
        async () => {
          throw new Error("permission denied for table products");
        },
        () => ["cached"],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("describes a total failure in plain language", () => {
    const e = new AllTargetsFailed("Saving sale");
    expect(e.name).toBe("AllTargetsFailed");
    expect(e.message).toMatch(/Database Connection Required|Central server relay is offline/);
  });

  it("exposes the same gateway under both names", () => {
    expect(dbProxy).toBe(dbRouter);
  });

  it("offers table operations so screens never pick a database", () => {
    for (const fn of ["query", "insert", "upsert", "update", "delete"] as const) {
      expect(typeof dbRouter[fn]).toBe("function");
    }
  });
});