import { Link } from "@tanstack/react-router";
import { groupForRoute } from "@/lib/settings-groups";
import { useEmbeddedSettings } from "@/platforms/web/components/pos/settings/embed";

const BASE =
  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap";
const ACTIVE = "bg-primary text-primary-foreground";
const IDLE = "text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * Sub-tab strip for a unified settings area. Rendered at the top of every page
 * that belongs to a group, so all of one domain's options read as a single
 * screen instead of scattered menu entries.
 *
 * System diagnostics switch in place: those tabs report back through `onTab`
 * and the hub swaps the panel below without leaving the window.
 */
export function SettingsTabs({
  current,
  activeTab,
  onTab,
}: {
  current: string;
  activeTab?: string;
  onTab?: (tab: string) => void;
}) {
  const group = groupForRoute(current);
  // Inside the workspace sheet the category strip above the cards already does
  // this job, so the page-level tab strip is dropped.
  const embedded = useEmbeddedSettings();
  if (!group || embedded) return null;

  return (
    <nav aria-label={`${group.label} sections`} className="w-full max-w-full space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {group.label}
      </p>
      <div className="flex w-full max-w-full flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {group.tabs.map((tab) => {
          if (tab.tab && onTab) {
            const active = tab.tab === activeTab;
            return (
              <button
                key={tab.tab}
                type="button"
                title={tab.blurb}
                aria-current={active ? "page" : undefined}
                onClick={() => onTab(tab.tab as string)}
                className={`${BASE} ${active ? ACTIVE : IDLE}`}
              >
                {tab.label}
              </button>
            );
          }
          const active = tab.to === current && !tab.tab;
          return (
            <Link
              key={tab.tab ?? tab.to}
              to={tab.to as never}
              title={tab.blurb}
              aria-current={active ? "page" : undefined}
              className={`${BASE} ${active ? ACTIVE : IDLE}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}