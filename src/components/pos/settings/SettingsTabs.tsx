import { Link } from "@tanstack/react-router";
import { groupForRoute } from "@/lib/settings-groups";

/**
 * Sub-tab strip for a unified settings area. Rendered at the top of every page
 * that belongs to a group, so all of one domain's options read as a single
 * screen instead of scattered menu entries.
 */
export function SettingsTabs({ current }: { current: string }) {
  const group = groupForRoute(current);
  if (!group) return null;

  return (
    <nav aria-label={`${group.label} sections`} className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {group.label}
      </p>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {group.tabs.map((tab) => {
          const active = tab.to === current;
          return (
            <Link
              key={tab.to}
              to={tab.to as never}
              title={tab.blurb}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}