/**
 * Retiring a unit or a category must never rewrite history: old records keep
 * what they say, and only new choices lose the retired entry.
 */
import { describe, expect, it } from "vitest";
import { isActive, selectableCategories, selectableUnits } from "@/lib/catalog-meta";
import type { ProductCategory, UomUnit } from "@/core/types/pos-types";

const cat = (id: string, active?: boolean): ProductCategory => ({
  id,
  name: id,
  kind: "category",
  parentId: null,
  sort: 0,
  ...(active === undefined ? {} : { active }),
});

const unit = (code: string, active?: boolean): UomUnit => ({
  id: code,
  code,
  name: code,
  allowDecimal: false,
  sort: 0,
  ...(active === undefined ? {} : { active }),
});

describe("retired catalogue entries", () => {
  it("treats anything without a flag as active", () => {
    expect(isActive(cat("rackets"))).toBe(true);
    expect(isActive(cat("old", false))).toBe(false);
  });

  it("drops retired categories from a new record's choices", () => {
    const all = [cat("rackets"), cat("old", false)];
    expect(selectableCategories(all).map((c) => c.id)).toEqual(["rackets"]);
  });

  it("keeps the entry the record already carries", () => {
    const all = [cat("rackets"), cat("old", false)];
    expect(selectableCategories(all, "old").map((c) => c.id)).toEqual(["rackets", "old"]);
  });

  it("does the same for units, by code or by id", () => {
    const all = [unit("pcs"), unit("gross", false)];
    expect(selectableUnits(all).map((u) => u.code)).toEqual(["pcs"]);
    expect(selectableUnits(all, "gross").map((u) => u.code)).toEqual(["pcs", "gross"]);
  });
});
