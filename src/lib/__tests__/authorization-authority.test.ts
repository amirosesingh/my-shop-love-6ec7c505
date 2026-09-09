import { describe, expect, it } from "vitest";
import {
  canAuthorizeAmount,
  canRequestApproval,
  defaultRule,
  effectiveApprovalAuthority,
  resolveRules,
} from "../authorization";

const rule = {
  ...defaultRule("discount_over_limit"),
  mode: "either" as const,
  requesterRoles: ["cashier"],
  allowedRoles: ["supervisor", "manager"],
  extraAuthority: { "role:supervisor": 5, "role:manager": 20, "user:sarah": 25 },
};

describe("central relative approval authority", () => {
  it("keeps request rights separate from decision rights", () => {
    expect(canRequestApproval(rule, { role: "cashier" })).toBe(true);
    expect(canRequestApproval(rule, { role: "guest" })).toBe(false);
    expect(canRequestApproval({ ...rule, mode: "pin" }, { role: "cashier" })).toBe(false);
  });

  it.each([
    ["supervisor", 10.01, true],
    ["supervisor", 15, true],
    ["supervisor", 15.01, false],
    ["supervisor", 25, false],
    ["manager", 25, true],
    ["manager", 30, true],
    ["manager", 30.01, false],
    ["manager", 100, false],
  ] as const)("calculates %s authority for %s", (role, requested, allowed) => {
    expect(canAuthorizeAmount(rule, { role }, requested, 10)).toBe(allowed);
  });

  it.each([0, 5, 9.99, 10])("keeps values through the direct boundary direct: %s", (value) => {
    expect(value <= 10).toBe(true);
  });

  it("applies an optional absolute ceiling", () => {
    const capped = { ...rule, absoluteCeilings: { "role:manager": 20 } };
    expect(effectiveApprovalAuthority(capped, { role: "manager" }, 15).effectiveMaximum).toBe(20);
    expect(canAuthorizeAmount(capped, { role: "manager" }, 20.01, 15)).toBe(false);
  });

  it("lets a personal relative allowance override the role allowance", () => {
    const authority = effectiveApprovalAuthority(rule, { userId: "Sarah", role: "manager" }, 10);
    expect(authority.extraAllowance).toBe(25);
    expect(authority.effectiveMaximum).toBe(35);
  });

  it("preserves legacy authority_limits as absolute values", () => {
    const legacy = { ...rule, extraAuthority: {}, authorityLimits: { "role:supervisor": 20 } };
    expect(effectiveApprovalAuthority(legacy, { role: "supervisor" }, 10)).toMatchObject({
      mode: "legacy_absolute",
      effectiveMaximum: 20,
    });
  });

  it("uses branch rules over global rules", () => {
    const global = {
      ...rule,
      scopeType: "global" as const,
      scopeId: "",
      extraAuthority: { "role:manager": 20 },
    };
    const branch = {
      ...rule,
      scopeType: "branch" as const,
      scopeId: "b1",
      extraAuthority: { "role:manager": 5 },
    };
    expect(
      resolveRules([global, branch], "b1").discount_over_limit.extraAuthority["role:manager"],
    ).toBe(5);
    expect(
      resolveRules([global, branch], "b2").discount_over_limit.extraAuthority["role:manager"],
    ).toBe(20);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses invalid numeric values: %s",
    (value) => {
      expect(canAuthorizeAmount(rule, { role: "manager" }, value, 10)).toBe(false);
    },
  );
});
