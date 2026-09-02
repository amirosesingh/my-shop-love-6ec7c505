/**
 * Scope picker for the settings hierarchy: Global, a cluster, or one branch.
 */
import { Building2, Globe, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import type { SettingScope } from "@/lib/settings-scope";
import type { Store } from "@/core/types/pos-types";

export type ScopeChoice = { scope: SettingScope; scopeId: string };

export function clusterList(stores: Store[]): string[] {
  const ids = new Set<string>();
  for (const s of stores) ids.add(s.groupId?.trim() || "default");
  return [...ids].sort();
}

export function ScopeSelector({
  stores,
  value,
  onChange,
}: {
  stores: Store[];
  value: ScopeChoice;
  onChange: (next: ScopeChoice) => void;
}) {
  const clusters = clusterList(stores);

  const tab = (scope: SettingScope, label: string, Icon: typeof Globe) => (
    <Button
      key={scope}
      type="button"
      size="sm"
      variant={value.scope === scope ? "default" : "outline"}
      onClick={() =>
        onChange({
          scope,
          scopeId:
            scope === "GLOBAL"
              ? ""
              : scope === "CLUSTER"
                ? (clusters[0] ?? "default")
                : (stores[0]?.id ?? ""),
        })
      }
    >
      <Icon className="size-4" /> {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      {tab("GLOBAL", "Global", Globe)}
      {tab("CLUSTER", "Cluster", Layers)}
      {tab("BRANCH", "Branch", Building2)}

      {value.scope === "CLUSTER" && (
        <ThemedSelect
          ariaLabel="Cluster"
          className="h-9 min-w-44"
          value={value.scopeId}
          onChange={(v) => onChange({ scope: "CLUSTER", scopeId: v })}
          options={clusters.map((c) => ({ value: c, label: c }))}
        />
      )}

      {value.scope === "BRANCH" && (
        <ThemedSelect
          ariaLabel="Branch"
          className="h-9 min-w-52"
          value={value.scopeId}
          onChange={(v) => onChange({ scope: "BRANCH", scopeId: v })}
          options={stores.map((s) => ({
            value: s.id,
            label: `${s.name} · ${s.groupId?.trim() || "default"}`,
          }))}
        />
      )}
    </div>
  );
}