/**
 * Landing page for a sidebar group: every option in the group as a card, so a
 * section can be opened as its own page instead of only expanding a list.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { navGroups, navItemKey, type NavItem } from "@/platforms/web/components/pos/nav-config";
import { useAuth } from "@/lib/pos-auth";
import { isDesktop } from "@/lib/branding";

export function SectionHub({ groupId }: { groupId: string }) {
  const { can, isAdmin } = useAuth();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);

  const group = navGroups.find((g) => g.id === groupId);
  if (!group) return null;

  const canSee = (item: NavItem) => {
    if (item.desktopHidden && desktop) return false;
    if (item.flag && !can(item.flag)) return false;
    if (item.adminOnly && !isAdmin && !item.flag) return false;
    return true;
  };

  // The hub itself is never one of its own cards.
  const items = group.items.filter((i) => i.to !== group.hubTo).filter(canSee);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to register
          </Link>
        </div>

        <header className="flex items-start gap-3">
          <group.icon className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">{group.label}</h1>
            {group.blurb && <p className="text-sm text-muted-foreground">{group.blurb}</p>}
          </div>
        </header>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You do not have access to anything in this section.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <Link
                key={navItemKey(item)}
                to={item.to}
                hash={item.hash}
                search={item.section ? { section: item.section } : {}}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60"
              >
                <item.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  {item.blurb && (
                    <span className="block text-xs text-muted-foreground">{item.blurb}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}