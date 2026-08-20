/**
 * Settings inheritance: Private beats Branch beats Cluster beats Global, and
 * a globally locked section cannot be overridden by anyone.
 */
import { describe, expect, it } from "vitest";

import { emptyBranchSettings, resolveScopedSettings, type BranchSettingsState } from "../branch-settings";

type Bag = Record<string, unknown>;
const merge = (target: Bag, patch: unknown) => ({ ...target, ...(patch as Bag) });

const scope = (over: Partial<BranchSettingsState>): BranchSettingsState => ({
  ...emptyBranchSettings,
  ...over,
  overrides: { ...emptyBranchSettings.overrides, ...(over.overrides ?? {}) },
  locks: { ...(over.locks ?? {}) },
});

describe("resolveScopedSettings", () => {
  it("returns the base record untouched when no scope overrides anything", () => {
    const base = { taxRate: 5 };
    const out = resolveScopedSettings(base, emptyBranchSettings, merge);
    expect(out.touched).toBe(false);
    expect(out.settings).toBe(base);
  });

  it("lets a cluster override the global record", () => {
    const out = resolveScopedSettings(
      { taxRate: 5 },
      scope({ overrides: { CLUSTER: { tax: { taxRate: 7 } }, BRANCH: {}, PRIVATE: {} } as never }),
      merge,
    );
    expect(out.settings.taxRate).toBe(7);
    expect(out.touched).toBe(true);
  });

  it("lets a branch beat its cluster", () => {
    const out = resolveScopedSettings(
      { taxRate: 5 },
      scope({
        overrides: { CLUSTER: { tax: { taxRate: 7 } }, BRANCH: { tax: { taxRate: 9 } }, PRIVATE: {} } as never,
      }),
      merge,
    );
    expect(out.settings.taxRate).toBe(9);
  });

  it("lets a terminal's private override beat the branch", () => {
    const out = resolveScopedSettings(
      { taxRate: 5 },
      scope({
        overrides: {
          CLUSTER: { tax: { taxRate: 7 } },
          BRANCH: { tax: { taxRate: 9 } },
          PRIVATE: { tax: { taxRate: 11 } },
        } as never,
      }),
      merge,
    );
    expect(out.settings.taxRate).toBe(11);
  });

  it("ignores every tier for a locked section", () => {
    const out = resolveScopedSettings(
      { taxRate: 5 },
      scope({
        overrides: { CLUSTER: { tax: { taxRate: 7 } }, BRANCH: { tax: { taxRate: 9 } }, PRIVATE: {} } as never,
        locks: { tax: true } as never,
      }),
      merge,
    );
    expect(out.settings.taxRate).toBe(5);
    expect(out.touched).toBe(false);
  });

  it("keeps unlocked sections working while another one is locked", () => {
    const out = resolveScopedSettings(
      { taxRate: 5, receiptFooter: "" },
      scope({
        overrides: {
          CLUSTER: {},
          BRANCH: { tax: { taxRate: 9 }, receipt: { receiptFooter: "Thanks" } },
          PRIVATE: {},
        } as never,
        locks: { tax: true } as never,
      }),
      merge,
    );
    expect(out.settings.taxRate).toBe(5);
    expect(out.settings.receiptFooter).toBe("Thanks");
  });
});
