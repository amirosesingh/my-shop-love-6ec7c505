/**
 * The settings window.
 *
 * Desktop and Electron get a two-panel layout: a navigation rail that stays put
 * while the page on the right scrolls. Phones and tablets drop the rail and read
 * as ordinary full-screen pages with a back link, so the same routes serve both
 * without a second settings system.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  cardForLocation,
  matchSettings,
  routeOf,
  searchOf,
  useSettingsNav,
} from "@/platforms/web/components/pos/settings/use-settings-nav";
import type { SettingsCard } from "@/lib/settings-catalog";

/** A settings page link. Cards can carry a `?tab=`, so the search is passed on. */
export function SettingsLink({
  card,
  className,
  children,
  onClick,
}: {
  card: SettingsCard;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={routeOf(card) as never}
      search={searchOf(card) as never}
      onClick={onClick}
      className={className}
    >
      {children}
    </Link>
  );
}

function NavRail({ activeId }: { activeId?: string }) {
  const { cards, categories } = useSettingsNav();
  const [query, setQuery] = useState("");
  const term = query.trim();
  const results = matchSettings(cards, term);

  return (
    <nav
      aria-label="Settings navigation"
      className="sticky top-0 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 self-start overflow-y-auto border-r border-border bg-sidebar/40 px-2 py-3 lg:block xl:w-72"
    >
      <Link
        to="/"
        className="mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to register
      </Link>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="h-8 pl-8 pr-7 text-xs"
        />
        {term && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {term ? (
        <div className="space-y-0.5">
          {results.length ? (
            results.map((c) => (
              <SettingsLink
                key={c.id}
                card={c}
                onClick={() => setQuery("")}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <c.icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{c.label}</span>
                  <span className="block truncate text-[11px]">
                    Settings → {categories.find((g) => g.id === c.category)?.label}
                  </span>
                </span>
              </SettingsLink>
            ))
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">No matching setting.</p>
          )}
        </div>
      ) : (
        categories.map((g) => (
          <div key={g.id} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {cards
                .filter((c) => c.category === g.id)
                .map((c) => (
                  <SettingsLink
                    key={c.id}
                    card={c}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      c.id === activeId
                        ? "bg-sidebar-accent font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <c.icon className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{c.label}</span>
                  </SettingsLink>
                ))}
            </div>
          </div>
        ))
      )}
    </nav>
  );
}

/**
 * Wraps a settings page. `home` drops the breadcrumb and the rail highlight for
 * the settings landing page, which draws its own header.
 */
export function SettingsShell({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const { cards, categories } = useSettingsNav();
  const tab = typeof search["tab"] === "string" ? search["tab"] : undefined;
  const active = home ? null : cardForLocation(cards, pathname, tab);
  const category = categories.find((g) => g.id === active?.category);

  return (
    <AppShell>
      <div className="flex min-h-full w-full">
        <NavRail activeId={active?.id} />

        <div className="min-w-0 flex-1">
          {!home && (
            <div className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur">
              <Link
                to="/settings"
                search={category ? ({ cat: category.id } as never) : ({} as never)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Back to settings"
              >
                <ChevronLeft className="size-4" /> Settings
              </Link>
              {category && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="truncate text-muted-foreground">{category.label}</span>
                </>
              )}
              {active && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="truncate font-medium">{active.label}</span>
                </>
              )}
            </div>
          )}

          {children}
        </div>
      </div>
    </AppShell>
  );
}
