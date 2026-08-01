import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navGroups, navItemKey, type NavGroup, type NavItem } from "./nav-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const OPEN_KEY = "pos.nav.openGroups";
const COLLAPSE_KEY = "pos.nav.collapsed";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  const update = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  };
  return [collapsed, update] as const;
}

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  canSee: (item: NavItem) => boolean;
  inbound?: number;
  header?: React.ReactNode;
  footer?: React.ReactNode;
};

export function SidebarNav({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  canSee,
  inbound = 0,
  header,
  footer,
}: Props) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const hash = useRouterState({ select: (r) => r.location.hash });
  const search = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>([]);

  const groups: NavGroup[] = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0),
    [canSee],
  );

  const activeGroupId = useMemo(() => {
    const match = groups.find((g) =>
      g.items.some((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to))),
    );
    return match?.id;
  }, [groups, pathname]);

  // restore saved accordion state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) setOpen(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  // keep the group of the current route expanded
  useEffect(() => {
    if (!activeGroupId) return;
    setOpen((prev) => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]));
  }, [activeGroupId]);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open));
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (i) =>
              i.label.toLowerCase().includes(q) ||
              (i.keywords ?? "").includes(q) ||
              g.label.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.items.length > 0)
    : groups;

  const isActive = (i: NavItem) => {
    const pathOk = i.to === "/" ? pathname === "/" : pathname.startsWith(i.to);
    if (!pathOk) return false;
    const current = (hash ?? "").replace(/^#/, "");
    if ((i.hash ?? "") !== current) return false;
    const activeSection = typeof search?.["section"] === "string" ? search["section"] : "";
    return (i.section ?? "") === activeSection;
  };

  const toggleGroup = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const ItemLink = ({ item, dense }: { item: NavItem; dense?: boolean }) => (
    <Link
      to={item.to}
      hash={item.hash}
      search={item.section ? { section: item.section } : {}}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        dense && "text-[13px]",
        isActive(item) && "bg-sidebar-accent font-medium text-primary",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{item.label}</span>
      {item.to === "/transfers" && inbound > 0 && (
        <Badge className="ml-auto h-5 min-w-5 shrink-0 justify-center px-1 text-[10px]">
          {inbound}
        </Badge>
      )}
    </Link>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}

      {!collapsed && (
        <div className="relative px-2 pb-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu…"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {filtered.map((g) => {
          const expanded = q ? true : open.includes(g.id);

          if (collapsed) {
            return (
              <Popover key={g.id}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onMouseEnter={(e) => e.currentTarget.click()}
                    className={cn(
                      "flex w-full items-center justify-center rounded-md py-2.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                      activeGroupId === g.id && "bg-sidebar-accent text-primary",
                    )}
                    aria-label={g.label}
                  >
                    <g.icon className="size-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="w-60 p-2">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </p>
                  <div className="space-y-0.5">
                    {g.items.map((i) => (
                      <ItemLink key={navItemKey(i)} item={i} dense />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-sidebar-accent",
                  activeGroupId === g.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <g.icon className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{g.label}</span>
                <ChevronDown
                  className={cn(
                    "ml-auto size-3.5 shrink-0 transition-transform duration-200",
                    !expanded && "-rotate-90",
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="ml-3 space-y-0.5 border-l border-border pl-2 pt-0.5">
                    {g.items.map((i) => (
                      <ItemLink key={navItemKey(i)} item={i} dense />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches</p>
        )}
      </nav>

      {footer}

      {onToggleCollapse && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={cn("h-8 w-full text-xs", collapsed ? "justify-center px-0" : "justify-start")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      )}
    </div>
  );
}
