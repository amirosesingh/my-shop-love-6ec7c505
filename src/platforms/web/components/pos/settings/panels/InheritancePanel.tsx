import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/notify";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InheritedField } from "@/platforms/web/components/pos/settings/InheritedField";
import { PushToChildrenDialog } from "@/platforms/web/components/pos/settings/PushToChildrenDialog";
import { ScopeSelector, type ScopeChoice } from "@/platforms/web/components/pos/settings/ScopeSelector";
import { useAuth } from "@/lib/pos-auth";
import { usePos } from "@/lib/pos-store";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";
import {
  getScopedSettings,
  syncSettingsBatch,
  upsertScopedSettings,
} from "@/lib/settings-scope.functions";
import {
  SETTING_CATEGORIES,
  SETTING_DEFS,
  coerceValue,
  scopeLabel,
  type ResolvedSetting,
  type SettingValue,
} from "@/lib/settings-scope";

function emptyState(): ResolvedSetting[] {
  return SETTING_DEFS.map((d) => ({
    key: d.key,
    value: d.fallback,
    source: "DEFAULT" as const,
    isOverridden: false,
    parentValue: null,
  }));
}

export function InheritancePanel() {
  const { stores, currentStore } = usePos();
  const { isAdmin, can } = useAuth();
  const mayEdit = isAdmin || can("can_access_pos_settings");

  const [choice, setChoice] = useState<ScopeChoice>({ scope: "GLOBAL", scopeId: "" });
  const [server, setServer] = useState<ResolvedSetting[]>(emptyState);
  const [draft, setDraft] = useState<ResolvedSetting[]>(emptyState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState("");

  const label = useMemo(() => {
    if (choice.scope === "GLOBAL") return scopeLabel("GLOBAL");
    if (choice.scope === "CLUSTER") return scopeLabel("CLUSTER", choice.scopeId);
    const store = stores.find((s) => s.id === choice.scopeId);
    return scopeLabel("BRANCH", store?.name ?? choice.scopeId);
  }, [choice, stores]);

  const load = useCallback(async () => {
    setLoading(true);
    setWarning("");
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        setWarning("Sign in with a supervisor account to load the settings hierarchy.");
        setServer(emptyState());
        setDraft(emptyState());
        return;
      }
      const res = await getScopedSettings({
        data: { accessToken: auth.accessToken, scope: choice.scope, scopeId: choice.scopeId },
      });
      if (!res.ok) {
        setWarning(res.error ?? "Could not load settings");
        setServer(emptyState());
        setDraft(emptyState());
        return;
      }
      const rows = res.settings as ResolvedSetting[];
      if (res.warning) setWarning(res.warning);
      setServer(rows);
      setDraft(rows);
    } catch (e) {
      setWarning((e as Error).message || "Could not load settings");
    } finally {
      setLoading(false);
    }
  }, [choice]);

  useEffect(() => {
    void load();
  }, [load]);

  // Default the branch picker to the till's own branch the first time it opens.
  useEffect(() => {
    setChoice((c) =>
      c.scope === "BRANCH" && !c.scopeId ? { scope: "BRANCH", scopeId: currentStore.id } : c,
    );
  }, [currentStore.id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(server);

  const setValue = (key: string, value: SettingValue) =>
    setDraft((d) => d.map((s) => (s.key === key ? { ...s, value } : s)));

  const setOverride = (key: string, on: boolean) =>
    setDraft((d) =>
      d.map((s) => {
        if (s.key !== key) return s;
        const def = SETTING_DEFS.find((x) => x.key === key)!;
        return {
          ...s,
          isOverridden: on,
          // Turning an override on starts from whatever is inherited today.
          value: on ? s.value : coerceValue(def, s.parentValue),
          source: on ? choice.scope : s.source,
        };
      }),
    );

  async function save() {
    setSaving(true);
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        toast.error("Sign in with a supervisor account to change settings");
        return;
      }
      const patch: Record<string, { value: SettingValue | null; isOverridden: boolean }> = {};
      for (const row of draft) {
        const before = server.find((s) => s.key === row.key);
        const changed =
          !before || before.isOverridden !== row.isOverridden || before.value !== row.value;
        if (!changed) continue;
        const overridden = choice.scope === "GLOBAL" ? true : row.isOverridden;
        patch[row.key] = { value: overridden ? row.value : null, isOverridden: overridden };
      }
      if (Object.keys(patch).length === 0) return;

      const res = await upsertScopedSettings({
        data: {
          accessToken: auth.accessToken,
          scope: choice.scope,
          scopeId: choice.scopeId,
          patch,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not save settings");
        return;
      }
      const rows = res.settings as ResolvedSetting[];
      setServer(rows);
      setDraft(rows);
      toast.success(`Saved for ${label}`);
    } catch (e) {
      notifyError(e, "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function push(keys: string[]) {
    const auth = await getPosCallerAuth();
    if (!auth.accessToken) {
      toast.error("Sign in with a supervisor account to push settings");
      return;
    }
    const res = await syncSettingsBatch({
      data: {
        accessToken: auth.accessToken,
        scope: choice.scope === "CLUSTER" ? "CLUSTER" : "GLOBAL",
        scopeId: choice.scopeId,
        keys,
      },
    });
    if (!res.ok) {
      toast.error(res.error ?? "Could not push settings");
      return;
    }
    toast.success(
      `Pushed ${res.result.written} value(s) to ${res.result.targets} branch(es)`,
    );
    void load();
  }

  const pushTargets = useMemo(() => {
    if (choice.scope === "GLOBAL") return stores.map((s) => ({ id: s.id, name: s.name }));
    if (choice.scope === "CLUSTER") {
      return stores
        .filter((s) => (s.groupId?.trim() || "default") === choice.scopeId)
        .map((s) => ({ id: s.id, name: s.name }));
    }
    return [];
  }, [choice, stores]);

  return (
    <div className="w-full max-w-full space-y-5">

        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Layers className="size-5 shrink-0 text-primary" /> Settings inheritance
            </h2>
            <p className="text-sm text-muted-foreground">
              Values flow Global → Cluster → Branch. Leave a row on “Sync” to follow the tier above
              it, or switch it to “Custom” to keep a local value.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </header>

        <ScopeSelector stores={stores} value={choice} onChange={setChoice} />

        {warning && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {warning} Showing shipped defaults until the settings hierarchy is reachable.
            </span>
          </p>
        )}

        {SETTING_CATEGORIES.map((cat) => {
          const defs = SETTING_DEFS.filter((d) => d.category === cat.id);
          return (
            <section key={cat.id} className="space-y-2 rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{cat.label}</h2>
                  <p className="text-xs text-muted-foreground">{cat.blurb}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Default tier: {cat.tier.toLowerCase()}
                </Badge>
              </div>
              <div>
                {defs.map((def) => {
                  const state =
                    draft.find((s) => s.key === def.key) ??
                    ({
                      key: def.key,
                      value: def.fallback,
                      source: "DEFAULT",
                      isOverridden: false,
                      parentValue: null,
                    } satisfies ResolvedSetting);
                  return (
                    <InheritedField
                      key={def.key}
                      def={def}
                      state={state}
                      scope={choice.scope}
                      disabled={!mayEdit}
                      onValue={(v) => setValue(def.key, v)}
                      onOverride={(on) => setOverride(def.key, on)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {mayEdit && (
          <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
            <span className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : `All settings saved · ${label}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {choice.scope !== "BRANCH" && (
                <PushToChildrenDialog
                  scope={choice.scope}
                  scopeLabel={label}
                  targets={pushTargets}
                  settings={draft}
                  disabled={dirty || saving}
                  onConfirm={push}
                />
              )}
              <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}