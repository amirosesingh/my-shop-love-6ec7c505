/**
 * One navigation model for the whole settings area.
 *
 * Desktop rail, mobile list and the search box all read from here, so a page
 * cannot appear in one place and be missing from another. Everything is built
 * from `SETTINGS_CARDS`, filtered by the same role, visibility and platform
 * rules the workspace has always used.
 */
import { useEffect, useMemo, useState } from "react";
import { isDesktop } from "@/lib/branding";
import { useVisibility } from "@/lib/ui-visibility";
import {
  SETTINGS_CARDS,
  SETTINGS_CATEGORIES,
  type SettingsCard,
  type SettingsCategory,
} from "@/lib/settings-catalog";

/** `/settings/system?tab=logic-health` → `/settings/system`. */
export function routeOf(card: SettingsCard): string {
  return card.to.split("?")[0] as string;
}

/** The search params a card's link needs, if any. */
export function searchOf(card: SettingsCard): Record<string, string> {
  const query = card.to.split("?")[1];
  if (!query) return {};
  return Object.fromEntries(new URLSearchParams(query).entries());
}

export type SettingsNav = {
  cards: SettingsCard[];
  categories: SettingsCategory[];
  /** Windows build: cloud-only areas are managed in the web console. */
  desktop: boolean;
};

export function useSettingsNav(): SettingsNav {
  const { visibleRoute } = useVisibility();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);

  const cards = useMemo(
    () =>
      SETTINGS_CARDS.filter(
        (c) =>
          !(c.cloudOnly && desktop) && !(c.desktopOnly && !desktop) && visibleRoute(routeOf(c)),
      ),
    [desktop, visibleRoute],
  );

  const categories = useMemo(
    () => SETTINGS_CATEGORIES.filter((g) => cards.some((c) => c.category === g.id)),
    [cards],
  );

  return { cards, categories, desktop };
}

/** The card a settings URL is showing, matching the `?tab=` variants too. */
export function cardForLocation(
  cards: SettingsCard[],
  pathname: string,
  tab?: string,
): SettingsCard | null {
  const onRoute = cards.filter((c) => routeOf(c) === pathname);
  if (!onRoute.length) return null;
  if (tab) {
    const exact = onRoute.find((c) => searchOf(c)["tab"] === tab);
    if (exact) return exact;
  }
  return onRoute.find((c) => !Object.keys(searchOf(c)).length) ?? (onRoute[0] as SettingsCard);
}

export function matchSettings(cards: SettingsCard[], term: string): SettingsCard[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  return cards.filter((c) =>
    `${c.label} ${c.blurb} ${c.keywords ?? ""}`.toLowerCase().includes(q),
  );
}
