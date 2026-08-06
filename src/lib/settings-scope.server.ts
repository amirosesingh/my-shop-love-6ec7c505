/**
 * Server-only resolver for the Global → Cluster → Branch settings hierarchy.
 *
 * Everything is read and written through security-definer RPCs on the POS
 * database, so the browser can never write a scope it is not allowed to touch.
 * When the RPCs are not installed yet the resolver degrades to the shipped
 * defaults instead of breaking the settings page.
 */
import { rpc } from "./pos-rules.server";
import {
  SETTING_BY_KEY,
  SETTING_DEFS,
  coerceValue,
  type ResolvedSetting,
  type SettingScope,
  type SettingValue,
} from "./settings-scope";

type EffectiveRow = {
  setting_key?: string;
  effective_value?: unknown;
  source?: string;
  is_overridden?: boolean;
  parent_inherited_value?: unknown;
};

function merge(rows: EffectiveRow[], scope: SettingScope): ResolvedSetting[] {
  const byKey = new Map<string, EffectiveRow>();
  for (const row of rows) if (row?.setting_key) byKey.set(row.setting_key, row);

  return SETTING_DEFS.map((def) => {
    const row = byKey.get(def.key);
    const stored = row?.effective_value ?? null;
    const parentRaw = row?.parent_inherited_value ?? null;
    const overridden = Boolean(row?.is_overridden);
    const source =
      stored === null
        ? ("DEFAULT" as const)
        : ((row?.source as SettingScope | undefined) ?? scope);

    return {
      key: def.key,
      value: coerceValue(def, stored),
      source,
      isOverridden: overridden,
      parentValue: parentRaw === null ? null : coerceValue(def, parentRaw),
    } satisfies ResolvedSetting;
  });
}

/** Effective settings plus inheritance metadata for one scope. */
export async function readScopedSettings(
  scope: SettingScope,
  scopeId: string,
  accessToken?: string,
): Promise<{ settings: ResolvedSetting[]; warning?: string }> {
  try {
    const rows = await rpc<EffectiveRow[]>(
      "settings_effective",
      { _scope: scope, _scope_id: scope === "GLOBAL" ? "" : scopeId },
      accessToken,
    );
    return { settings: merge(Array.isArray(rows) ? rows : [], scope) };
  } catch (e) {
    return {
      settings: merge([], scope),
      warning: (e as Error).message || "Settings hierarchy is not available",
    };
  }
}

export type SettingPatchEntry = { value?: SettingValue | null; isOverridden: boolean };

/** Write overrides for one scope; clearing an override falls back to the parent. */
export async function writeScopedSettings(
  scope: SettingScope,
  scopeId: string,
  patch: Record<string, SettingPatchEntry>,
  accessToken: string,
): Promise<ResolvedSetting[]> {
  const payload: Record<string, { value: SettingValue | null; is_overridden: boolean }> = {};
  for (const [key, entry] of Object.entries(patch)) {
    const def = SETTING_BY_KEY[key];
    if (!def) continue;
    payload[key] = {
      value: entry.isOverridden ? coerceValue(def, entry.value ?? null) : null,
      is_overridden: entry.isOverridden,
    };
  }

  const rows = await rpc<EffectiveRow[]>(
    "settings_upsert",
    { _scope: scope, _scope_id: scope === "GLOBAL" ? "" : scopeId, _patch: payload },
    accessToken,
  );
  return merge(Array.isArray(rows) ? rows : [], scope);
}

export type SyncBatchResult = {
  targets: number;
  written: number;
  detail: { store_id: string; store_name: string; written: number }[];
};

/** Push a global or cluster set of values onto every child branch. */
export async function pushScopedSettings(
  scope: SettingScope,
  scopeId: string,
  keys: string[],
  accessToken: string,
): Promise<SyncBatchResult> {
  const known = keys.filter((k) => SETTING_BY_KEY[k]);
  const res = await rpc<SyncBatchResult>(
    "settings_sync_batch",
    {
      _scope: scope,
      _scope_id: scope === "GLOBAL" ? "" : scopeId,
      _keys: known.length ? known : null,
    },
    accessToken,
  );
  return {
    targets: Number(res?.targets) || 0,
    written: Number(res?.written) || 0,
    detail: Array.isArray(res?.detail) ? res.detail : [],
  };
}