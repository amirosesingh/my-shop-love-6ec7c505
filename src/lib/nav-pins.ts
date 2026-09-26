/**
 * Pinned shortcuts.
 *
 * A pin is only an identifier — a navigation route key or a settings card id.
 * Nothing about a page is copied: the pinned entry is rendered from the same
 * navigation list everyone else sees, and is filtered through the same
 * permission, visibility and platform rules, so a pin can never open a screen
 * the person is not allowed to reach.
 *
 * Pins live centrally (`nav_pins`) so they follow a person from till to till.
 * A copy is kept on the device so the pinned block still renders with no
 * connection, and a change made offline is queued through the ordinary
 * outbox.
 */
import { useCallback, useEffect, useState } from "react";
import { routedQuery } from "@/core/api/db-query";
import { commitOps } from "@/core/api/pos-db";

export type PinKind = "nav" | "settings";

export type Pin = {
  id?: string;
  kind: PinKind;
  key: string;
  /** True for a pin an administrator set for everyone. */
  company: boolean;
};

const CACHE_KEY = "pos.nav.pins.v1";
const COMPANY_OWNER = "00000000-0000-0000-0000-000000000000";

type Row = {
  id: string;
  owner_id: string | null;
  item_kind: string;
  item_key: string;
  sort_order: number | null;
};

export const pinId = (kind: PinKind, key: string) => `${kind}:${key}`;

export function samePin(a: Pin, b: Pin) {
  return a.kind === b.kind && a.key === b.key && a.company === b.company;
}

function readCache(): Pin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const list = raw ? (JSON.parse(raw) as Pin[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && p.kind && p.key) : [];
  } catch {
    return [];
  }
}

function writeCache(pins: Pin[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(pins));
  } catch {
    /* storage full — pins simply fall back to the central copy */
  }
}

const listeners = new Set<() => void>();
let current: Pin[] | null = null;

function publish(pins: Pin[]) {
  current = pins;
  writeCache(pins);
  for (const l of listeners) l();
}

function toPins(rows: Row[]): Pin[] {
  return rows
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({
      kind: (r.item_kind === "settings" ? "settings" : "nav") as PinKind,
      id: r.id,
      key: r.item_key,
      company: r.owner_id === null,
    }));
}

/** Pull the central list. Falls back to the cached copy when offline. */
export async function refreshPins(ownerId: string | null = null): Promise<Pin[]> {
  try {
    const data = await routedQuery("nav_pins", {
      columns: "id,owner_id,item_kind,item_key,sort_order",
      orderBy: { column: "sort_order", ascending: true }, limit: 2000,
    });
    const visible = (data as unknown as Row[]).filter((row) => row.owner_id == null || (!!ownerId && row.owner_id === ownerId));
    const pins = toPins(visible);
    publish(pins);
    return pins;
  } catch {
    const cached = readCache();
    publish(cached);
    return cached;
  }
}

export function listPins(): Pin[] {
  if (current === null) current = readCache();
  return current;
}

async function addPin(pin: Pin, ownerId: string | null) {
  const next = [...listPins().filter((p) => !samePin(p, pin)), pin];
  publish(next);
  const row = {
    id: crypto.randomUUID(),
    owner_id: pin.company ? null : ownerId,
    item_kind: pin.kind,
    item_key: pin.key,
    sort_order: next.length,
  };
  await commitOps("Saving navigation pin", [{ kind: "upsert", table: "nav_pins", rows: [row] }]);
}

async function removePin(pin: Pin, ownerId: string | null) {
  publish(listPins().filter((p) => !samePin(p, pin)));
  let id = pin.id;
  if (!id) {
    const rows = await routedQuery("nav_pins", {
      match: { item_kind: pin.kind, item_key: pin.key }, limit: 100,
    });
    id = String(rows.find((row) => pin.company ? row.owner_id == null : row.owner_id === (ownerId ?? COMPANY_OWNER))?.id ?? "");
  }
  if (id) await commitOps("Deleting navigation pin", [{ kind: "delete", table: "nav_pins", match: { id } }]);
}

export type NavPins = {
  pins: Pin[];
  isPinned: (kind: PinKind, key: string) => boolean;
  /** Add or remove a personal pin. Company pins need `company: true`. */
  toggle: (kind: PinKind, key: string, company?: boolean) => void;
};

/**
 * @param ownerId signed-in account id; without one only company pins show and
 *                nothing can be pinned.
 */
export function useNavPins(ownerId: string | null): NavPins {
  const [pins, setPins] = useState<Pin[]>(() => listPins());

  useEffect(() => {
    const sync = () => setPins(listPins());
    listeners.add(sync);
    void refreshPins(ownerId);
    return () => {
      listeners.delete(sync);
    };
  }, [ownerId]);

  const isPinned = useCallback(
    (kind: PinKind, key: string) => pins.some((p) => p.kind === kind && p.key === key),
    [pins],
  );

  const toggle = useCallback(
    (kind: PinKind, key: string, company = false) => {
      if (!ownerId && !company) return;
      const existing = pins.find((p) => p.kind === kind && p.key === key);
      if (existing) void removePin(existing, ownerId);
      else void addPin({ kind, key, company }, ownerId);
    },
    [ownerId, pins],
  );

  return { pins, isPinned, toggle };
}

/** Test seam: drops the in-memory copy so the next read comes from storage. */
export function resetPinCache() {
  current = null;
}
