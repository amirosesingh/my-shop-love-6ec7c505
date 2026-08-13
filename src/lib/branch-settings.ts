/**
 * Scoped settings overrides and global locks.
 *
 * A scope only stores the blocks it actually overrides; everything else
 * resolves down the chain and finally to the shipped defaults. Resolution
 * order is Private > Branch > Cluster > Global > hardcoded default. Locks are
 * global and stop any scope from overriding a block at all.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SettingsSectionId } from "./settings-sections";

export type SectionPatch = Record<string, unknown>;

/** Override tiers, weakest first. Global is the base record, not a tier. */
export const SETTING_TIERS = ["CLUSTER", "BRANCH", "PRIVATE"] as const;
export type SettingTier = (typeof SETTING_TIERS)[number];
export type SettingSource = "GLOBAL" | SettingTier;

export const TIER_LABELS: Record<SettingSource, string> = {
  GLOBAL: "Global",
  CLUSTER: "Cluster",
  BRANCH: "Branch",
  PRIVATE: "Private",
};

export type ScopeIds = { CLUSTER: string; BRANCH: string; PRIVATE: string };

export const emptyScopeIds: ScopeIds = { CLUSTER: "", BRANCH: "", PRIVATE: "" };

export type TierOverrides = Partial<Record<SettingsSectionId, SectionPatch>>;

export type BranchSettingsState = {
  /** tier -> section id -> the patch that tier applies */
  overrides: Record<SettingTier, TierOverrides>;
  /** section id -> locked globally */
  locks: Partial<Record<SettingsSectionId, boolean>>;
};

export const emptyBranchSettings: BranchSettingsState = {
  overrides: { CLUSTER: {}, BRANCH: {}, PRIVATE: {} },
  locks: {},
};

type OverrideRow = { section: string; patch: unknown };
type LockRow = { section: string; locked: boolean };

/** Overrides for every tier this terminal belongs to, plus the lock table. */
export async function loadBranchSettings(ids: ScopeIds): Promise<BranchSettingsState> {
  const state: BranchSettingsState = {
    overrides: { CLUSTER: {}, BRANCH: {}, PRIVATE: {} },
    locks: {},
  };
  try {
    const reads = await Promise.all([
      ...SETTING_TIERS.map(async (tier) => {
        const scopeId = ids[tier];
        if (!scopeId) return { tier, rows: [] as OverrideRow[] };
        const { data } = await supabase
          .from("settings_overrides")
          .select("section,patch")
          .eq("scope", tier)
          .eq("scope_id", scopeId);
        return { tier, rows: (data ?? []) as OverrideRow[] };
      }),
    ]);
    for (const { tier, rows } of reads) {
      for (const row of rows) {
        if (row.patch && typeof row.patch === "object") {
          state.overrides[tier][row.section as SettingsSectionId] = row.patch as SectionPatch;
        }
      }
    }
    const locks = await supabase.from("settings_locks").select("section,locked");
    for (const row of (locks.data ?? []) as LockRow[]) {
      state.locks[row.section as SettingsSectionId] = !!row.locked;
    }
  } catch {
    /* offline or not granted yet — the global record still applies */
  }
  return state;
}

export async function saveSectionOverride(
  tier: SettingTier,
  scopeId: string,
  section: SettingsSectionId,
  patch: SectionPatch,
  updatedBy: string,
): Promise<void> {
  if (!scopeId) throw new Error(`No ${TIER_LABELS[tier].toLowerCase()} is selected for this terminal`);
  const { error } = await supabase.from("settings_overrides").upsert(
    {
      scope: tier,
      scope_id: scopeId,
      section,
      patch: patch as never,
      updated_by: updatedBy,
    },
    { onConflict: "scope,scope_id,section" },
  );
  if (error) throw new Error(error.message);
}

export async function clearSectionOverride(
  tier: SettingTier,
  scopeId: string,
  section: SettingsSectionId,
): Promise<void> {
  if (!scopeId) return;
  const { error } = await supabase
    .from("settings_overrides")
    .delete()
    .eq("scope", tier)
    .eq("scope_id", scopeId)
    .eq("section", section);
  if (error) throw new Error(error.message);
}

export async function setSectionLock(
  section: SettingsSectionId,
  locked: boolean,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from("settings_locks")
    .upsert({ section, locked, updated_by: updatedBy }, { onConflict: "section" });
  if (error) throw new Error(error.message);
}