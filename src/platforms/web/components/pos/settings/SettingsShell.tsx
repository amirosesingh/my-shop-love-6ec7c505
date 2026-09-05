/**
 * The settings window.
 *
 * Desktop and Electron get a two-panel layout: a navigation rail that stays put
 * while the page on the right scrolls. Phones and tablets get the same
 * navigation as a slide-over from the header, so no page is a dead end.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  SettingsLink,
  SettingsNavTree,
} from "@/platforms/web/components/pos/settings/SettingsNavTree";
import {
  cardForLocation,
  useSettingsNav,
} from "@/platforms/web/components/pos/settings/use-settings-nav";

export { SettingsLink };

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
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname, tab]);

  return (
    <AppShell>
      <div className="flex min-h-full w-full">
        <nav
          aria-label="Settings navigation"
          className="sticky top-0 hidden max-h-[calc(100dvh-3.5rem)] w-64 shrink-0 self-start overflow-hidden border-r border-border bg-sidebar/40 px-2 py-3 lg:block xl:w-72"
        >
          <SettingsNavTree activeId={active?.id} activeCategory={active?.category} />
        </nav>

        <div className="min-w-0 flex-1">
          <div
            className={
              "sticky top-0 z-20 items-center gap-1.5 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur " +
              (home ? "flex lg:hidden" : "flex")
            }
          >
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger
                aria-label="Open settings navigation"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              >
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 px-2 py-3">
                <SheetTitle className="sr-only">Settings navigation</SheetTitle>
                <SettingsNavTree
                  activeId={active?.id}
                  activeCategory={active?.category}
                  onNavigate={() => setDrawer(false)}
                />
              </SheetContent>
            </Sheet>

            {!home && (
              <>
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
              </>
            )}
            {home && <span className="font-medium text-muted-foreground lg:hidden">Settings</span>}
          </div>

          {children}
        </div>
      </div>
    </AppShell>
  );
}
