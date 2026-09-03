import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { SettingsSheet } from "@/platforms/web/components/pos/settings/SettingsSheet";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/pos-auth";
import { isDesktop } from "@/lib/branding";
import { useVisibility } from "@/lib/ui-visibility";
import {
  PINNED_SETTINGS,
  SETTINGS_CARDS,
  SETTINGS_CATEGORIES,
  settingsCard,
  type SettingsCategoryId,
} from "@/lib/settings-catalog";

type Search = { cat?: SettingsCategoryId; card?: string; section?: string };

const CATEGORY_IDS = SETTINGS_CATEGORIES.map((c) => c.id) as string[];

export const Route = createFileRoute("/settings/")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const out: Search = {};
    const cat = search["cat"];
    if (typeof cat === "string" && CATEGORY_IDS.includes(cat)) out.cat = cat as SettingsCategoryId;
    const card = search["card"];
    if (typeof card === "string" && settingsCard(card)) out.card = card;
    const section = search["section"];
    if (typeof section === "string" && section) out.section = section;
    return out;
  },
  // Older links used /settings?section=tax — open that card in the workspace.
  beforeLoad: ({ search }) => {
    const section = (search as Search).section;
    if (!section) return;
    const card = settingsCard(section);
    throw redirect({ to: "/settings", search: card ? { card: card.id } : {} });
  },
  head: () => ({
    meta: [
      { title: "Settings Workspace — Northwind POS" },
      {
        name: "description",
        content:
          "Every POS configuration area as a card: display, receipts, tax, payments, WhatsApp bills, sync and health checks, each opening in a half window over your work.",
      },
      { property: "og:title", content: "Settings Workspace — Northwind POS" },
      {
        property: "og:description",
        content: "All register configuration in one workspace, opening in place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHub,
});

function SettingsHub() {
  const { isAdmin, can } = useAuth();
  const { visibleRoute } = useVisibility();
  const navigate = useNavigate({ from: "/settings/" });
  const { cat, card: openId } = Route.useSearch();
  const allowed = isAdmin || can("can_access_pos_settings");

  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const cards = SETTINGS_CARDS.filter(
    (c) =>
      !(c.cloudOnly && desktop) &&
      !(c.desktopOnly && !desktop) &&
      visibleRoute(c.to.split("?")[0] as string),
  );
  const categories = SETTINGS_CATEGORIES.filter((g) => cards.some((c) => c.category === g.id));
  const activeCat = cat && categories.some((g) => g.id === cat) ? cat : categories[0]?.id;

  const matches = term
    ? cards.filter((c) =>
        `${c.label} ${c.blurb} ${c.keywords ?? ""}`.toLowerCase().includes(term),
      )
    : [];
  const shown = term ? matches : cards.filter((c) => c.category === activeCat);
  const pinned = term
    ? []
    : PINNED_SETTINGS.map((id) => cards.find((c) => c.id === id)).filter(
        (c): c is (typeof cards)[number] => !!c,
      );

  const open = settingsCard(openId);
  const openCard = (id: string) =>
    void navigate({ search: { cat: activeCat, card: id } as never, replace: false });
  const closeCard = () => {
    setExpanded(false);
    void navigate({ search: { cat: activeCat } as never, replace: false });
  };

  const Card = ({ c }: { c: (typeof cards)[number] }) => (
    <button
      key={c.id}
      type="button"
      onClick={() => openCard(c.id)}
      className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/60"
    >
      <c.icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight">{c.label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          {c.blurb}
        </span>
      </span>
    </button>
  );

  return (
    <AppShell>
      <div className="w-full space-y-5 p-6">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to register
          </Link>
        </div>

        <header>
          <h1 className="text-2xl font-semibold">Settings workspace</h1>
          <p className="text-sm text-muted-foreground">
            Pick a category, then open any card in a half window over your work. Staff accounts and
            audit logs live under Staff &amp; Admin in the menu.
          </p>
        </header>

        {!allowed ? (
          <p className="text-sm text-muted-foreground">
            Configuration is managed by an administrator.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings — tax, printer, sync…"
                aria-label="Search settings"
                className="pl-9"
              />
            </div>

            {!term && (
              <>
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">Quick access</h2>
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {pinned.map((c) => (
                      <Card key={c.id} c={c} />
                    ))}
                  </div>
                </section>

                <nav aria-label="Settings categories" className="w-full max-w-full">
                  <div className="flex w-full flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
                    {categories.map((g) => {
                      const active = g.id === activeCat;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          title={g.blurb}
                          aria-current={active ? "page" : undefined}
                          onClick={() =>
                            void navigate({ search: { cat: g.id } as never, replace: true })
                          }
                          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </>
            )}

            {shown.length ? (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((c) => (
                  <Card key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing matches “{query}”. Try a shorter word.
              </p>
            )}
          </div>
        )}
      </div>

      <SettingsSheet
        card={open}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onClose={closeCard}
      />
    </AppShell>
  );
}
