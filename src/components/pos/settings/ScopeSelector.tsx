/**
 * Scope picker for the settings hierarchy: Global, a cluster, or one branch.
 */
import { Building2, Globe, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import type { SettingScope } from "@/lib/settings-scope";
import type { Store } from "@/lib/pos-types";

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
          aria-label="Cluster"
          className="h-9 min-w-44"
          value={value.scopeId}
          onChange={(e) => onChange({ scope: "CLUSTER", scopeId: e.target.value })}
        >
          {clusters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </ThemedSelect>
      )}

      {value.scope === "BRANCH" && (
        <ThemedSelect
          aria-label="Branch"
          className="h-9 min-w-52"
          value={value.scopeId}
          onChange={(e) => onChange({ scope: "BRANCH", scopeId: e.target.value })}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.groupId?.trim() || "default"}
            </option>
          ))}
        </ThemedSelect>
      )}
    </div>
  );
}