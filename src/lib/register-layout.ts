/**
 * Saved register canvas layouts.
 *
 * A till either runs the factory three-column screen (no saved layout) or an
 * admin-authored atomic canvas. The JSON is stored per terminal on the device
 * so a shop floor machine keeps its arrangement offline and a reinstall of the
 * software elsewhere never inherits somebody else's screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LEGACY_EXPANSION,
  MODULE_BY_ID,
  REGISTER_MODULES,
  isRegisterModuleId,
  type RegisterModuleId,
} from "./register-modules";
import { isActionId } from "./register-actions";

export type ModuleView = "grid" | "list";
export type ModuleFont = "sm" | "md" | "lg" | "xl";
export type ModuleTone = "neutral" | "primary" | "success" | "warning" | "destructive";
export type ModuleStyle = "both" | "text" | "icon";

/** An admin-authored button bound to any page, modal or till action. */
export type CustomButtonSpec = {
  label: string;
  icon: string;
  action: string;
  /** Optional hex override; presets use the semantic `tone` field instead. */
  color?: string;
};

export type ModuleOptions = {
  view?: ModuleView;
  font?: ModuleFont;
  tone?: ModuleTone;
  style?: ModuleStyle;
  label?: string;
  /** Inner padding in px around the node content. */
  pad?: number;
  custom?: CustomButtonSpec;
};

export type LayoutBox = ModuleOptions & {
  /** A registry module id, or `custom:<id>` for an admin-created button. */
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RegisterLayout = { version: 3; items: LayoutBox[] };

export const GRID_COLS = 24;
export const DEFAULT_PAD = 5;
export const MAX_PAD = 16;

const KEY_PREFIX = "pos.register.layout";
const storageKey = (terminal: string) => `${KEY_PREFIX}.v3:${terminal || "default"}`;
const v2Key = (terminal: string) => `${KEY_PREFIX}.v2:${terminal || "default"}`;
const v1Key = (terminal: string) => `${KEY_PREFIX}.v1:${terminal || "default"}`;

export const isCustomId = (id: string) => id.startsWith("custom:");
export const newCustomId = () =>
  `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type NodeSpec = {
  label: string;
  minW: number;
  minH: number;
  w: number;
  h: number;
  chrome: "bare" | "panel";
  supportsView: boolean;
  supportsLabel: boolean;
  essential: boolean;
};

/** Sizing and capability facts for any node, registry module or custom button. */
export function nodeSpec(box: Pick<LayoutBox, "i" | "custom">): NodeSpec | null {
  if (isCustomId(box.i)) {
    return {
      label: box.custom?.label || "Custom button",
      minW: 1,
      minH: 1,
      w: 4,
      h: 3,
      chrome: "bare",
      supportsView: false,
      supportsLabel: true,
      essential: false,
    };
  }
  if (!isRegisterModuleId(box.i)) return null;
  const def = MODULE_BY_ID[box.i];
  return {
    label: def.label,
    minW: def.minW,
    minH: def.minH,
    w: def.w,
    h: def.h,
    chrome: def.chrome ?? "panel",
    supportsView: !!def.supportsView,
    supportsLabel: !!def.supportsLabel,
    essential: !!def.essential,
  };
}

/** The factory screen expressed as atomic nodes on the 24-column canvas. */
export function factoryLayout(): RegisterLayout {
  return {
    version: 3,
    items: [
      { i: "catalog", x: 0, y: 0, w: 10, h: 34, view: "list", font: "md" },
      { i: "billNumber", x: 10, y: 0, w: 5, h: 3 },
      { i: "shiftBadge", x: 15, y: 0, w: 3, h: 3 },
      { i: "actExchange", x: 18, y: 0, w: 3, h: 3 },
      { i: "actClear", x: 21, y: 0, w: 3, h: 3 },
      { i: "scanBar", x: 10, y: 3, w: 8, h: 4 },
      { i: "memberSearch", x: 10, y: 7, w: 8, h: 8 },
      { i: "cartLines", x: 10, y: 15, w: 8, h: 12 },
      { i: "totalsBlock", x: 10, y: 27, w: 8, h: 8 },
      { i: "balanceDue", x: 10, y: 35, w: 8, h: 3 },
      { i: "actCharge", x: 10, y: 38, w: 8, h: 3 },
      { i: "actBookLater", x: 10, y: 41, w: 8, h: 3 },
      { i: "actHold", x: 18, y: 3, w: 6, h: 3 },
      { i: "actVoid", x: 18, y: 6, w: 6, h: 3 },
      { i: "actCoupon", x: 18, y: 9, w: 6, h: 3 },
      { i: "actSplit", x: 18, y: 12, w: 6, h: 3 },
      { i: "heldList", x: 18, y: 15, w: 6, h: 6 },
      { i: "actDrawer", x: 18, y: 21, w: 6, h: 3 },
      { i: "receiptToggle", x: 18, y: 24, w: 6, h: 3 },
      { i: "reprintDeck", x: 18, y: 27, w: 6, h: 4 },
    ],
  };
}

const FONTS: ModuleFont[] = ["sm", "md", "lg", "xl"];
const TONES: ModuleTone[] = ["neutral", "primary", "success", "warning", "destructive"];
const STYLES: ModuleStyle[] = ["both", "text", "icon"];
const HEX = /^#[0-9a-fA-F]{6}$/;

function readCustom(rec: Record<string, unknown>): CustomButtonSpec | null {
  const raw = rec["custom"];
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const action = String(c["action"] ?? "");
  if (!isActionId(action)) return null;
  const color = typeof c["color"] === "string" && HEX.test(c["color"]) ? c["color"] : undefined;
  return {
    label: String(c["label"] ?? "Button").slice(0, 40),
    icon: String(c["icon"] ?? "Zap").slice(0, 40),
    action,
    ...(color ? { color } : {}),
  };
}

function box(id: string, rec: Record<string, unknown>, custom?: CustomButtonSpec): LayoutBox | null {
  const spec = nodeSpec({ i: id, ...(custom ? { custom } : {}) });
  if (!spec) return null;
  const font = FONTS.find((f) => f === rec["font"]);
  const tone = TONES.find((t) => t === rec["tone"]);
  const style = STYLES.find((s) => s === rec["style"]);
  const label = typeof rec["label"] === "string" ? rec["label"].slice(0, 40) : undefined;
  const padRaw = Number(rec["pad"]);
  const pad = Number.isFinite(padRaw) ? Math.max(0, Math.min(MAX_PAD, Math.round(padRaw))) : DEFAULT_PAD;
  return {
    i: id,
    x: Number(rec["x"]) || 0,
    y: Number(rec["y"]) || 0,
    w: Math.max(spec.minW, Number(rec["w"]) || spec.w),
    h: Math.max(spec.minH, Number(rec["h"]) || spec.h),
    pad,
    ...(custom ? { custom } : {}),
    ...(rec["view"] === "grid" || rec["view"] === "list" ? { view: rec["view"] as ModuleView } : {}),
    ...(font ? { font } : {}),
    ...(tone ? { tone } : {}),
    ...(style ? { style } : {}),
    ...(label ? { label } : {}),
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
    if (clean.some((c) => c.i === id)) continue;
    if (isCustomId(id)) {
      const custom = readCustom(rec);
      if (!custom) continue;
      const b = box(id, rec, custom);
      if (b) clean.push(b);
      continue;
    }
    if (!isRegisterModuleId(id)) continue;
    const b = box(id, rec);
    if (b) clean.push(b);
  }
  return clean.length ? { version: 3, items: clean } : null;
}

/** A v1 coarse layout becomes atomic nodes stacked inside the old block area. */
function migrateV1(raw: unknown): RegisterLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: LayoutBox[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const children = LEGACY_EXPANSION[String(rec["i"] ?? "")];
    if (!children) continue;
    // v1 lived on 12 columns; double the coordinates for the 24-column canvas.
    const x = (Number(rec["x"]) || 0) * 2;
    const w = Math.max(2, (Number(rec["w"]) || 4) * 2);
    let y = Number(rec["y"]) || 0;
    for (const id of children) {
      if (out.some((o) => o.i === id)) continue;
      const def = MODULE_BY_ID[id];
      const h = Math.max(def.minH, def.h);
      out.push({
        i: id,
        x: Math.min(GRID_COLS - def.minW, x),
        y,
        w: Math.max(def.minW, Math.min(w, GRID_COLS - x)),
        h,
        pad: DEFAULT_PAD,
      });
      y += h;
    }
  }
  return out.length ? { version: 3, items: out } : null;
}

export function readLayout(terminal: string): RegisterLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(terminal));
    if (raw) return sanitise(JSON.parse(raw));
    // v2 already used atomic ids — it only needs the new padding default.
    const two = window.localStorage.getItem(v2Key(terminal));
    if (two) {
      const migrated = sanitise(JSON.parse(two));
      if (migrated) {
        window.localStorage.setItem(storageKey(terminal), JSON.stringify(migrated));
        window.localStorage.removeItem(v2Key(terminal));
      }
      return migrated;
    }
    const old = window.localStorage.getItem(v1Key(terminal));
    if (!old) return null;
    const migrated = migrateV1(JSON.parse(old));
    if (migrated) {
      window.localStorage.setItem(storageKey(terminal), JSON.stringify(migrated));
      window.localStorage.removeItem(v1Key(terminal));
    }
    return migrated;
  } catch {
    return null;
  }
}

export function writeLayout(terminal: string, layout: RegisterLayout | null) {
  if (typeof window === "undefined") return;
  try {
    if (layout) window.localStorage.setItem(storageKey(terminal), JSON.stringify(layout));
    else {
      window.localStorage.removeItem(storageKey(terminal));
      window.localStorage.removeItem(v2Key(terminal));
      window.localStorage.removeItem(v1Key(terminal));
    }
  } catch {
    /* storage full or blocked — the screen still works, it just won't persist */
  }
}

/** Next free row so a dropped element never lands on top of another. */
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
        const item: LayoutBox = {
          i: id,
          x: at ? Math.max(0, Math.min(GRID_COLS - def.w, at.x)) : 0,
          y: at ? at.y : nextRow(l.items),
          w: def.w,
          h: def.h,
          pad: DEFAULT_PAD,
          ...(def.supportsView ? { view: "list" as ModuleView } : {}),
        };
        return { ...l, items: [...l.items, item] };
      });
    },
    [update],
  );

  /** Drops a brand new admin-authored button onto the canvas. */
  const addCustom = useCallback(
    (spec: CustomButtonSpec, opts?: { tone?: ModuleTone; style?: ModuleStyle; pad?: number }) => {
      update((l) => {
        const item: LayoutBox = {
          i: newCustomId(),
          x: 0,
          y: nextRow(l.items),
          w: 4,
          h: 3,
          pad: opts?.pad ?? DEFAULT_PAD,
          custom: spec,
          ...(opts?.tone ? { tone: opts.tone } : {}),
          ...(opts?.style ? { style: opts.style } : {}),
        };
        return { ...l, items: [...l.items, item] };
      });
    },
    [update],
  );

  const removeModule = useCallback(
    (id: string) => update((l) => ({ ...l, items: l.items.filter((i) => i.i !== id) })),
    [update],
  );

  const setOptions = useCallback(
    (id: string, opts: ModuleOptions) =>
      update((l) => ({ ...l, items: l.items.map((i) => (i.i === id ? { ...i, ...opts } : i)) })),
    [update],
  );

  /** Applies one padding value to every node on the canvas. */
  const setAllPadding = useCallback(
    (pad: number) =>
      update((l) => ({
        ...l,
        items: l.items.map((i) => ({ ...i, pad: Math.max(0, Math.min(MAX_PAD, Math.round(pad))) })),
      })),
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
    addCustom,
    removeModule,
    setOptions,
    setAllPadding,
    applyBoxes,
    save,
    reset,
  };
}
