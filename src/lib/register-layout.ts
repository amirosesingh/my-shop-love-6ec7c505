/**
 * Saved register canvas layouts.
 *
 * A till either runs the factory three-column screen (no saved layout) or an
 * admin-authored canvas. The JSON is stored per terminal on the device so a
 * shop floor machine keeps its arrangement offline and a reinstall of the
 * software elsewhere never inherits somebody else's screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MODULE_BY_ID, REGISTER_MODULES, isRegisterModuleId, type RegisterModuleId } from "./register-modules";

export type ModuleView = "grid" | "list";
export type ModuleFont = "sm" | "md" | "lg";

export type LayoutBox = {
  i: RegisterModuleId;
  x: number;
  y: number;
  w: number;
  h: number;
  view?: ModuleView;
  font?: ModuleFont;
};

export type RegisterLayout = { version: 1; items: LayoutBox[] };

const KEY_PREFIX = "pos.register.layout.v1";

const storageKey = (terminal: string) => `${KEY_PREFIX}:${terminal || "default"}`;

/** The factory screen expressed on the canvas: catalog | bill | deck. */
export function factoryLayout(): RegisterLayout {
  return {
    version: 1,
    items: [
      { i: "catalog", x: 0, y: 0, w: 5, h: 26, view: "list", font: "md" },
      { i: "billHeader", x: 5, y: 0, w: 4, h: 4 },
      { i: "scanBar", x: 5, y: 4, w: 4, h: 3 },
      { i: "memberSearch", x: 5, y: 7, w: 4, h: 6 },
      { i: "cartLines", x: 5, y: 13, w: 4, h: 7 },
      { i: "billFooter", x: 5, y: 20, w: 4, h: 6 },
      { i: "transactionActions", x: 9, y: 0, w: 3, h: 14 },
      { i: "devicePrinting", x: 9, y: 14, w: 3, h: 6 },
    ],
  };
}

function sanitise(raw: unknown): RegisterLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const clean: LayoutBox[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const id = String(rec["i"] ?? "");
    if (!isRegisterModuleId(id)) continue;
    const def = MODULE_BY_ID[id];
    clean.push({
      i: id,
      x: Number(rec["x"]) || 0,
      y: Number(rec["y"]) || 0,
      w: Math.max(def.minW, Number(rec["w"]) || def.w),
      h: Math.max(def.minH, Number(rec["h"]) || def.h),
      ...(rec["view"] === "grid" || rec["view"] === "list" ? { view: rec["view"] as ModuleView } : {}),
      ...(rec["font"] === "sm" || rec["font"] === "md" || rec["font"] === "lg"
        ? { font: rec["font"] as ModuleFont }
        : {}),
    });
  }
  return clean.length ? { version: 1, items: clean } : null;
}

export function readLayout(terminal: string): RegisterLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(terminal));
    return raw ? sanitise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLayout(terminal: string, layout: RegisterLayout | null) {
  if (typeof window === "undefined") return;
  try {
    if (layout) window.localStorage.setItem(storageKey(terminal), JSON.stringify(layout));
    else window.localStorage.removeItem(storageKey(terminal));
  } catch {
    /* storage full or blocked — the screen still works, it just won't persist */
  }
}

/** Next free row so a dropped module never lands on top of another. */
export function nextRow(items: LayoutBox[]) {
  return items.reduce((max, it) => Math.max(max, it.y + it.h), 0);
}

export function useRegisterLayout(terminal: string) {
  const [saved, setSaved] = useState<RegisterLayout | null>(null);
  const [draft, setDraft] = useState<RegisterLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSaved(readLayout(terminal));
    setLoaded(true);
  }, [terminal]);

  const active = draft ?? saved;

  const startEdit = useCallback(() => {
    setDraft((d) => d ?? saved ?? factoryLayout());
    setPreviewing(false);
    setEditing(true);
  }, [saved]);

  const stopEdit = useCallback(() => {
    setEditing(false);
    setPreviewing(false);
    setDraft(null);
  }, []);

  const preview = useCallback(() => {
    setEditing(false);
    setPreviewing(true);
  }, []);

  const resumeEdit = useCallback(() => {
    setPreviewing(false);
    setEditing(true);
  }, []);

  const update = useCallback((fn: (l: RegisterLayout) => RegisterLayout) => {
    setDraft((d) => fn(d ?? factoryLayout()));
  }, []);

  const addModule = useCallback(
    (id: RegisterModuleId, at?: { x: number; y: number }) => {
      const def = MODULE_BY_ID[id];
      update((l) => {
        if (l.items.some((i) => i.i === id)) return l;
        const box: LayoutBox = {
          i: id,
          x: at ? Math.max(0, Math.min(12 - def.w, at.x)) : 0,
          y: at ? at.y : nextRow(l.items),
          w: def.w,
          h: def.h,
          ...(def.hasDisplayOptions ? { view: "list" as ModuleView, font: "md" as ModuleFont } : {}),
        };
        return { ...l, items: [...l.items, box] };
      });
    },
    [update],
  );

  const removeModule = useCallback(
    (id: RegisterModuleId) => update((l) => ({ ...l, items: l.items.filter((i) => i.i !== id) })),
    [update],
  );

  const setOptions = useCallback(
    (id: RegisterModuleId, opts: { view?: ModuleView; font?: ModuleFont }) =>
      update((l) => ({ ...l, items: l.items.map((i) => (i.i === id ? { ...i, ...opts } : i)) })),
    [update],
  );

  const applyBoxes = useCallback(
    (boxes: { i: string; x: number; y: number; w: number; h: number }[]) =>
      update((l) => ({
        ...l,
        items: l.items.map((it) => {
          const found = boxes.find((b) => b.i === it.i);
          return found ? { ...it, x: found.x, y: found.y, w: found.w, h: found.h } : it;
        }),
      })),
    [update],
  );

  const save = useCallback(() => {
    const next = draft ?? saved;
    if (!next) return;
    writeLayout(terminal, next);
    setSaved(next);
    setDraft(null);
    setEditing(false);
    setPreviewing(false);
  }, [draft, saved, terminal]);

  const reset = useCallback(() => {
    writeLayout(terminal, null);
    setSaved(null);
    setDraft(null);
    setEditing(false);
    setPreviewing(false);
  }, [terminal]);

  const placed = useMemo(() => new Set((active?.items ?? []).map((i) => i.i)), [active]);
  const palette = useMemo(() => REGISTER_MODULES.filter((m) => !placed.has(m.id)), [placed]);

  return {
    loaded,
    saved,
    draft,
    active,
    editing,
    previewing,
    palette,
    startEdit,
    stopEdit,
    preview,
    resumeEdit,
    addModule,
    removeModule,
    setOptions,
    applyBoxes,
    save,
    reset,
  };
}