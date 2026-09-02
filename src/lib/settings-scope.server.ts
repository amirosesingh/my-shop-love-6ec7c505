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

type ScopedRow = { scope?: string; scope_id?: string; key?: string; value?: unknown };

async function readWithService(scope: SettingScope, scopeId: string): Promise<EffectiveRow[]> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  let cluster = scope === "CLUSTER" ? scopeId : "";
  if (scope === "BRANCH") {
    const storeRes = await serviceRest(
      `stores?id=eq.${encodeURIComponent(scopeId)}&select=group_id&limit=1`,
    );
    if (!storeRes.ok) throw new Error((await storeRes.text()).slice(0, 400));
    const stores = (await storeRes.json()) as { group_id?: string | null }[];
    cluster = stores[0]?.group_id || "default";
  }

  const settingsRes = await serviceRest("settings_scoped?select=scope,scope_id,key,value,is_overridden");
  if (!settingsRes.ok) throw new Error((await settingsRes.text()).slice(0, 400));
  const rows = (await settingsRes.json()) as (ScopedRow & { is_overridden?: boolean })[];
  const active = rows.filter((row) => row.is_overridden !== false);
  const value = (tier: SettingScope, id: string, key: string) =>
    active.find((row) => row.scope === tier && row.scope_id === id && row.key === key)?.value;

  return SETTING_DEFS.map((def) => {
    const globalValue = value("GLOBAL", "", def.key);
    const clusterValue = cluster ? value("CLUSTER", cluster, def.key) : undefined;
    const branchValue = scope === "BRANCH" ? value("BRANCH", scopeId, def.key) : undefined;
    const effective =
      scope === "GLOBAL"
        ? globalValue
        : scope === "CLUSTER"
          ? (clusterValue ?? globalValue)
          : (branchValue ?? clusterValue ?? globalValue);
    const source =
      scope === "BRANCH" && branchValue !== undefined
        ? "BRANCH"
        : scope !== "GLOBAL" && clusterValue !== undefined
          ? "CLUSTER"
          : "GLOBAL";
    return {
      setting_key: def.key,
      effective_value: effective,
      source,
      is_overridden:
        scope === "GLOBAL"
          ? globalValue !== undefined
          : scope === "CLUSTER"
            ? clusterValue !== undefined
            : branchValue !== undefined,
      parent_inherited_value:
        scope === "GLOBAL" ? null : scope === "CLUSTER" ? globalValue : (clusterValue ?? globalValue),
    };
  });
}

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
    try {
      const rows = await readWithService(scope, scopeId);
      return { settings: merge(rows, scope) };
    } catch (fallbackError) {
      return {
        settings: merge([], scope),
        warning:
          (e as Error).message ||
          (fallbackError as Error).message ||
          "Settings hierarchy is not available",
      };
    }
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

/**
 * Write the same overrides straight to the table with service rights. Used
 * when the routine refuses the staff session (for example on a deployment
 * where the settings routines have not been re-granted yet). The caller has
 * already been proved to be a supervisor on the server.
 */
export async function writeScopedSettingsWithService(
  scope: SettingScope,
  scopeId: string,
  patch: Record<string, SettingPatchEntry>,
): Promise<ResolvedSetting[]> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  const id = scope === "GLOBAL" ? "" : scopeId;
  const keep: Record<string, unknown>[] = [];
  const clear: string[] = [];

  for (const [key, entry] of Object.entries(patch)) {
    const def = SETTING_BY_KEY[key];
    if (!def) continue;
    if (entry.isOverridden || scope === "GLOBAL") {
      keep.push({
        scope,
        scope_id: id,
        key,
        value: coerceValue(def, entry.value ?? null),
        is_overridden: true,
      });
    } else {
      clear.push(key);
    }
  }

  if (keep.length) {
    const res = await serviceRest("settings_scoped?on_conflict=scope,scope_id,key", {
      method: "POST",
      body: JSON.stringify(keep),
      prefer: "return=minimal,resolution=merge-duplicates",
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 400) || "Could not save settings");
  }
  for (const key of clear) {
    await serviceRest(
      `settings_scoped?scope=eq.${scope}&scope_id=eq.${encodeURIComponent(id)}` +
        `&key=eq.${encodeURIComponent(key)}`,
      { method: "DELETE", prefer: "return=minimal" },
    );
  }

  return merge(await readWithService(scope, scopeId), scope);
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