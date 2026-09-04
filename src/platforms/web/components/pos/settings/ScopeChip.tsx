/**
 * "Where does this apply?" chip.
 *
 * A label only — it reads the scope recorded for the page in the settings
 * catalog and names the branch in use. No value resolution happens here.
 */
import { useRouterState } from "@tanstack/react-router";
import { Building2, MonitorCog, Store } from "lucide-react";
import { SETTINGS_CARDS, type SettingsScope } from "@/lib/settings-catalog";
import { usePos } from "@/lib/pos-store";

export function scopeForPath(pathname: string, tab?: string): SettingsScope | undefined {
  const onRoute = SETTINGS_CARDS.filter((c) => c.to.split("?")[0] === pathname);
  if (!onRoute.length) return undefined;
  if (tab) {
    const exact = onRoute.find((c) => new URLSearchParams(c.to.split("?")[1] ?? "").get("tab") === tab);
    if (exact) return exact.scope;
  }
  return onRoute[0]?.scope;
}

export function ScopeChip() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const tab = useRouterState({
    select: (r) => (r.location.search as Record<string, unknown>)["tab"],
  });
  const { currentStore } = usePos();
  const scope = scopeForPath(pathname, typeof tab === "string" ? tab : undefined);
  if (!scope) return null;

  const Icon = scope === "terminal" ? MonitorCog : scope === "branch" ? Store : Building2;
  const label =
    scope === "terminal"
      ? "This terminal"
      : scope === "branch"
        ? `Branch — ${currentStore?.name ?? "current"}`
        : "Company";

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  );
}
