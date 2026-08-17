import type { LocationType, Product, Store } from "@/lib/pos-types";

/**
 * Location model helpers.
 *
 * A "location" is any physical place stock can sit: a storefront, a main
 * building, a sub-warehouse (floor / room / annex) nested inside one, or the
 * single central warehouse every inbound delivery lands in first.
 *
 * Nothing here writes: archiving, renaming and routing are all explicit user
 * actions handled by the screens that call these helpers.
 */

export const LOCATION_TYPES: { value: LocationType; label: string; hint: string }[] = [
  { value: "store", label: "Store", hint: "A storefront that sells to customers." },
  {
    value: "main_building",
    label: "Main building",
    hint: "A site that holds floors, rooms or annexes underneath it.",
  },
  {
    value: "sub_warehouse",
    label: "Sub-warehouse",
    hint: "A floor, vault, room or annex inside another location.",
  },
  {
    value: "central_warehouse",
    label: "Central warehouse",
    hint: "The hub every inbound delivery is received into first.",
  },
];

export const locationTypeLabel = (t?: LocationType | null) =>
  LOCATION_TYPES.find((x) => x.value === t)?.label ?? "Store";

/** Archived locations disappear from every picker but keep their history. */
export const isActiveLocation = (s: Store) => s.active !== false;

export const activeLocations = (stores: Store[]) => stores.filter(isActiveLocation);

/** Sub-locations nested directly under `id`. */
export const childrenOf = (stores: Store[], id: string) =>
  activeLocations(stores).filter((s) => s.parentId === id);

/** Locations with no parent — the roots of the tree. */
export const rootLocations = (stores: Store[]) => {
  const live = activeLocations(stores);
  const ids = new Set(live.map((s) => s.id));
  return live.filter((s) => !s.parentId || !ids.has(s.parentId));
};

/** The whole subtree under `id`, including `id` itself. */
export function descendants(stores: Store[], id: string): Store[] {
  const out: Store[] = [];
  const self = stores.find((s) => s.id === id);
  if (self) out.push(self);
  for (const child of childrenOf(stores, id)) out.push(...descendants(stores, child.id));
  return out;
}

/** Depth-first walk of the active tree with nesting depth for indentation. */
export function locationTree(stores: Store[]): { store: Store; depth: number }[] {
  const walk = (node: Store, depth: number): { store: Store; depth: number }[] => [
    { store: node, depth },
    ...childrenOf(stores, node.id).flatMap((c) => walk(c, depth + 1)),
  ];
  return rootLocations(stores).flatMap((r) => walk(r, 0));
}

/** The nominated central hub, or the first active location as a fallback. */
export const centralHub = (stores: Store[]) =>
  activeLocations(stores).find((s) => s.isCentral) ??
  activeLocations(stores).find((s) => s.locationType === "central_warehouse") ??
  null;

/**
 * Where stock received at the hub can actually be put away for a branch.
 * A branch with no sub-locations receives into itself.
 */
export function routingTargets(stores: Store[], branchId: string): Store[] {
  const kids = descendants(stores, branchId).filter(
    (s) => s.id !== branchId && s.locationType !== "main_building",
  );
  if (kids.length) return kids;
  const self = stores.find((s) => s.id === branchId);
  return self ? [self] : [];
}

/** Human path, e.g. "Riverside Tower › 2nd Floor Vault". */
export function locationPath(stores: Store[], id: string): string {
  const parts: string[] = [];
  let node = stores.find((s) => s.id === id);
  let hops = 0;
  while (node && hops < 20) {
    parts.unshift(node.name);
    node = node.parentId ? stores.find((s) => s.id === node?.parentId) : undefined;
    hops += 1;
  }
  return parts.join(" › ");
}

export const stockAtLocation = (p: Product, id: string) => Number(p.stockByStore?.[id] ?? 0) || 0;

/** Units sitting at a location and everything nested under it. */
export const rolledUpStock = (products: Product[], stores: Store[], id: string) => {
  const ids = descendants(stores, id).map((s) => s.id);
  return products.reduce((a, p) => a + ids.reduce((b, x) => b + stockAtLocation(p, x), 0), 0);
};

/**
 * Archiving guard. A location keeps its history forever, so it can only leave
 * the pickers once it is empty and none of its sub-locations are still live.
 */
export function archiveBlockers(
  products: Product[],
  stores: Store[],
  id: string,
): { reason: string; items: { name: string; qty: number }[] } | null {
  const liveChildren = childrenOf(stores, id);
  if (liveChildren.length)
    return {
      reason: `Archive the ${liveChildren.length} sub-location${liveChildren.length > 1 ? "s" : ""} underneath it first.`,
      items: [],
    };
  const items = products
    .map((p) => ({ name: p.name, qty: stockAtLocation(p, id) }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => b.qty - a.qty);
  if (items.length)
    return {
      reason: `${items.length} product${items.length > 1 ? "s" : ""} still hold stock here. Transfer them out first.`,
      items: items.slice(0, 12),
    };
  return null;
}
