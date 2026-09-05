/**
 * The settings navigation, shared by the desktop rail and the phone drawer.
 *
 * Categories fold away so a long list stays readable, the category holding the
 * open page unfolds by itself, and what you left open is remembered on this
 * device. The whole tree is reachable from the keyboard: up and down walk the
 * visible rows, left and right fold a category, Enter opens a page.
 */
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  matchSettings,
  routeOf,
  searchOf,
  useSettingsNav,
} from "@/platforms/web/components/pos/settings/use-settings-nav";
import type { SettingsCard, SettingsCategoryId } from "@/lib/settings-catalog";

const OPEN_KEY = "pos.settings.nav.open";

/** A settings page link. Cards can carry a `?tab=`, so the search is passed on. */
export function SettingsLink({
  card,
  className,
  children,
  onClick,
  ...rest
}: {
  card: SettingsCard;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
} & Record<string, unknown>) {
  return (
    <Link
      to={routeOf(card) as never}
      search={searchOf(card) as never}
      onClick={onClick}
      className={className}
      {...(rest as object)}
    >
      {children}
    </Link>
  );
}

export function readOpenCategories(): Record<string, boolean> | null {
  try {
    const raw = globalThis.localStorage?.getItem(OPEN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, boolean>;
  } catch {
    return null;
  }
}

function writeOpenCategories(state: Record<string, boolean>) {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, JSON.stringify(state));
  } catch {
    /* private mode — navigation still works, it just forgets. */
  }
}

/** Categories to unfold on first use: only the one holding the open page. */
export function initialOpenCategories(
  stored: Record<string, boolean> | null,
  activeCategory?: string,
): Record<string, boolean> {
  const base = stored ?? {};
  if (!activeCategory) return { ...base };
  return { ...base, [activeCategory]: true };
}

export function SettingsNavTree({
  activeId,
  activeCategory,
  onNavigate,
}: {
  activeId?: string;
  activeCategory?: SettingsCategoryId;
  onNavigate?: () => void;
}) {
  const { cards, categories } = useSettingsNav();
  const [query, setQuery] = useState("");
  const term = query.trim();
  const results = matchSettings(cards, term);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpen((prev) =>
      Object.keys(prev).length ? prev : initialOpenCategories(readOpenCategories(), activeCategory),
    );
  }, [activeCategory]);

  useEffect(() => {
    if (activeCategory) setOpen((prev) => (prev[activeCategory] ? prev : { ...prev, [activeCategory]: true }));
  }, [activeCategory]);

  const toggle = useCallback((id: string, next?: boolean) => {
    setOpen((prev) => {
      const state = { ...prev, [id]: next ?? !prev[id] };
      writeOpenCategories(state);
      return state;
    });
  }, []);

  const treeRef = useRef<HTMLDivElement>(null);

  /** Roving focus across the rows that are actually on screen. */
  const move = useCallback((from: HTMLElement, delta: number) => {
    const rows = Array.from(
      treeRef.current?.querySelectorAll<HTMLElement>('[data-nav-row="1"]') ?? [],
    );
    const i = rows.indexOf(from);
    const next = rows[i + delta];
    next?.focus();
  }, []);

  const byCategory = useMemo(
    () =>
      categories.map((g) => ({ group: g, items: cards.filter((c) => c.category === g.id) })),
    [cards, categories],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        to="/"
        onClick={onNavigate}
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

      <div ref={treeRef} className="min-h-0 flex-1 overflow-y-auto pb-4">
        {term ? (
          <div className="space-y-0.5">
            {results.length ? (
              results.map((c) => (
                <SettingsLink
                  key={c.id}
                  card={c}
                  onClick={() => {
                    setQuery("");
                    onNavigate?.();
                  }}
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
          <div role="tree" aria-label="Settings categories" className="space-y-1">
            {byCategory.map(({ group, items }) => {
              const expanded = !!open[group.id];
              return (
                <div key={group.id} role="none">
                  <button
                    type="button"
                    role="treeitem"
                    aria-expanded={expanded}
                    data-nav-row="1"
                    onClick={() => toggle(group.id)}
                    onKeyDown={(e) => {
                      const el = e.currentTarget;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        move(el, 1);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        move(el, -1);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        if (!expanded) toggle(group.id, true);
                        else move(el, 1);
                      } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        toggle(group.id, false);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <group.icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <span className="text-[10px] font-medium tabular-nums opacity-70">
                      {items.length}
                    </span>
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", expanded ? "" : "-rotate-90")}
                    />
                  </button>

                  {expanded && (
                    <div role="group" className="mt-0.5 space-y-0.5 pl-2">
                      {items.map((c) => (
                        <SettingsLink
                          key={c.id}
                          card={c}
                          role="treeitem"
                          data-nav-row="1"
                          aria-current={c.id === activeId ? "page" : undefined}
                          onClick={onNavigate}
                          onKeyDown={(e: React.KeyboardEvent<HTMLAnchorElement>) => {
                            const el = e.currentTarget;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              move(el, 1);
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              move(el, -1);
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              toggle(group.id, false);
                            }
                          }}
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
