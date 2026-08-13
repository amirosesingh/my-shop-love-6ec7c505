/**
 * Branch-level settings overrides and global locks.
 *
 * A branch only stores the blocks it actually overrides; everything else
 * resolves to the global record and finally to the shipped defaults. Locks are
 * global and stop a branch from overriding a block at all.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SettingsSectionId } from "./settings-sections";

export type SectionPatch = Record<string, unknown>;

export type BranchSettingsState = {
  /** section id -> the patch this branch applies over the global record */
  overrides: Partial<Record<SettingsSectionId, SectionPatch>>;
  /** section id -> locked globally */
  locks: Partial<Record<SettingsSectionId, boolean>>;
};

export const emptyBranchSettings: BranchSettingsState = { overrides: {}, locks: {} };

type OverrideRow = { section: string; patch: unknown };
type LockRow = { section: string; locked: boolean };

/** Overrides for one branch plus the global lock table. */
export async function loadBranchSettings(storeId: string): Promise<BranchSettingsState> {
  const state: BranchSettingsState = { overrides: {}, locks: {} };
  if (!storeId) return state;
  try {
    const [over, locks] = await Promise.all([
      supabase
        .from("settings_overrides")
        .select("section,patch")
        .eq("scope", "BRANCH")
        .eq("scope_id", storeId),
      supabase.from("settings_locks").select("section,locked"),
    ]);
    for (const row of (over.data ?? []) as OverrideRow[]) {
      if (row.patch && typeof row.patch === "object") {
        state.overrides[row.section as SettingsSectionId] = row.patch as SectionPatch;
      }
    }
    for (const row of (locks.data ?? []) as LockRow[]) {
      state.locks[row.section as SettingsSectionId] = !!row.locked;
    }
  } catch {
    /* offline or not granted yet — the global record still applies */
  }
  return state;
}

export async function saveSectionOverride(
  storeId: string,
  section: SettingsSectionId,
  patch: SectionPatch,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase.from("settings_overrides").upsert(
    {
      scope: "BRANCH",
      scope_id: storeId,
      section,
      patch: patch as never,
      updated_by: updatedBy,
    },
    { onConflict: "scope,scope_id,section" },
  );
  if (error) throw new Error(error.message);
}

export async function clearSectionOverride(
  storeId: string,
  section: SettingsSectionId,
): Promise<void> {
  const { error } = await supabase
    .from("settings_overrides")
    .delete()
    .eq("scope", "BRANCH")
    .eq("scope_id", storeId)
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