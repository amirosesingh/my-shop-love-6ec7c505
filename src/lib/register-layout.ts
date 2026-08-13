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
import {
  layoutKey,
  legacyKeys,
  platformTarget,
  readLayoutRaw,
  readLocal,
  writeLayoutRaw,
  writeLocal,
  type PlatformTarget,
} from "./layout-store";

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
  /** Group boxes only: the header shown across the top of the container. */
  title?: string;
};

export type LayoutBox = ModuleOptions & {
  /** A registry module id, `custom:<id>` for an admin button, or `group:<id>`. */
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Id of the group box this node is docked inside, when it is in one. */
  parent?: string;
};

export type CanvasAspect = "free" | "16:9" | "4:3";

/**
 * The logical canvas every till renders. Coordinates are stored in these grid
 * units and never in device pixels, so the same JSON draws an identical screen
 * on a 4K monitor and on a 1024px touch terminal — only the scale changes.
 */
export type CanvasConfig = {
  cols: number;
  rowHeight: number;
  /** Logical design width in px that the canvas is scaled from. */
  baseWidth: number;
  aspect: CanvasAspect;
};

export type RegisterLayout = {
  version: 4;
  platform_target: PlatformTarget;
  canvas: CanvasConfig;
  items: LayoutBox[];
};

export const GRID_COLS = 24;
export const DEFAULT_PAD = 5;
export const MAX_PAD = 16;
export const COL_CHOICES = [12, 16, 20, 24, 32] as const;
export const MIN_ROW_HEIGHT = 8;
export const MAX_ROW_HEIGHT = 60;

export const DEFAULT_CANVAS: CanvasConfig = {
  cols: GRID_COLS,
  rowHeight: 20,
  baseWidth: 1920,
  aspect: "free",
};

export const ASPECT_RATIO: Record<CanvasAspect, number | null> = {
  free: null,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
};

export const isCustomId = (id: string) => id.startsWith("custom:");
export const newCustomId = () =>
  `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const isGroupId = (id: string) => id.startsWith("group:");
export const newGroupId = () =>
  `group:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

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
  if (isGroupId(box.i)) {
    return {
      label: "Group box",
      minW: 2,
      minH: 2,
      w: 8,
      h: 10,
      chrome: "panel",
      supportsView: false,
      supportsLabel: true,
      essential: false,
    };
  }
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
    version: 4,
    platform_target: platformTarget(),
    canvas: { ...DEFAULT_CANVAS },
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
      { i: "actBooking", x: 10, y: 44, w: 8, h: 3 },
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
  const parent = typeof rec["parent"] === "string" && isGroupId(rec["parent"]) ? rec["parent"] : undefined;
  const title = typeof rec["title"] === "string" ? rec["title"].slice(0, 40) : undefined;
  return {
    i: id,
    x: Number(rec["x"]) || 0,
    y: Number(rec["y"]) || 0,
    w: Math.max(spec.minW, Number(rec["w"]) || spec.w),
    h: Math.max(spec.minH, Number(rec["h"]) || spec.h),
    pad,
    ...(custom ? { custom } : {}),
    ...(parent ? { parent } : {}),
    ...(title ? { title } : {}),
    ...(rec["view"] === "grid" || rec["view"] === "list" ? { view: rec["view"] as ModuleView } : {}),
    ...(font ? { font } : {}),
    ...(tone ? { tone } : {}),
    ...(style ? { style } : {}),
    ...(label ? { label } : {}),
  };
}

function readCanvas(raw: unknown): CanvasConfig {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cols = COL_CHOICES.find((c) => c === Number(rec["cols"])) ?? DEFAULT_CANVAS.cols;
  const rhRaw = Number(rec["rowHeight"]);
  const rowHeight = Number.isFinite(rhRaw)
    ? Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(rhRaw)))
    : DEFAULT_CANVAS.rowHeight;
  const bwRaw = Number(rec["baseWidth"]);
  const baseWidth = Number.isFinite(bwRaw)
    ? Math.max(800, Math.min(3840, Math.round(bwRaw)))
    : DEFAULT_CANVAS.baseWidth;
  const aspect = (["free", "16:9", "4:3"] as CanvasAspect[]).find((a) => a === rec["aspect"]) ?? "free";
  return { cols, rowHeight, baseWidth, aspect };
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
    if (isGroupId(id)) {
      const b = box(id, rec);
      if (b) clean.push(b);
      continue;
    }
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
  // Drop dangling group references so orphans stay draggable on their own.
  const groups = new Set(clean.filter((c) => isGroupId(c.i)).map((c) => c.i));
  for (const c of clean) if (c.parent && !groups.has(c.parent)) delete c.parent;
  return clean.length
    ? {
        version: 4,
        platform_target: platformTarget(),
        canvas: readCanvas((raw as { canvas?: unknown }).canvas),
        items: clean,
      }
    : null;
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
  return out.length
    ? { version: 4, platform_target: platformTarget(), canvas: { ...DEFAULT_CANVAS }, items: out }
    : null;
}

/**
 * Loads the layout saved for *this* platform, migrating a legacy shared save
 * on first run so an existing desktop design is not lost.
 */
export async function readLayout(terminal: string): Promise<RegisterLayout | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = await readLayoutRaw(terminal);
    if (raw) return sanitise(JSON.parse(raw));
    const [v3, v2, v1] = legacyKeys(terminal).map((k) => readLocal(k));
    const legacy = v3 ?? v2;
    const migrated = legacy ? sanitise(JSON.parse(legacy)) : v1 ? migrateV1(JSON.parse(v1)) : null;
    if (migrated) await writeLayoutRaw(terminal, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export async function writeLayout(terminal: string, layout: RegisterLayout | null) {
  if (typeof window === "undefined") return;
  await writeLayoutRaw(terminal, layout ? JSON.stringify(layout) : null);
  if (!layout) for (const k of legacyKeys(terminal)) writeLocal(k, null);
}

export { layoutKey };

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
    let alive = true;
    setLoaded(false);
    void readLayout(terminal).then((l) => {
      if (!alive) return;
      setSaved(l);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
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
          x: at ? Math.max(0, Math.min(l.canvas.cols - def.w, at.x)) : 0,
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

  /** Adds an empty group container that other nodes can be docked into. */
  const addGroup = useCallback(
    (at?: { x: number; y: number }) => {
      update((l) => {
        const item: LayoutBox = {
          i: newGroupId(),
          x: at ? Math.max(0, Math.min(l.canvas.cols - 8, at.x)) : 0,
          y: at ? at.y : nextRow(l.items),
          w: 8,
          h: 10,
          pad: DEFAULT_PAD,
          title: "Group",
        };
        // Groups render behind their children, so keep them first in the list.
        return { ...l, items: [item, ...l.items] };
      });
    },
    [update],
  );

  /** Canvas geometry: columns, row height, design width and aspect lock. */
  const setCanvas = useCallback(
    (patch: Partial<CanvasConfig>) =>
      update((l) => {
        const canvas = readCanvas({ ...l.canvas, ...patch });
        if (canvas.cols === l.canvas.cols) return { ...l, canvas };
        // Re-proportion every node so a column change never shreds the design.
        const k = canvas.cols / l.canvas.cols;
        const items = l.items.map((it) => {
          const spec = nodeSpec(it);
          const w = Math.max(spec?.minW ?? 1, Math.min(canvas.cols, Math.round(it.w * k)));
          return { ...it, x: Math.max(0, Math.min(canvas.cols - w, Math.round(it.x * k))), w };
        });
        return { ...l, canvas, items };
      }),
    [update],
  );

  const removeModule = useCallback(
    (id: string) =>
      update((l) => ({
        ...l,
        items: l.items
          .filter((i) => i.i !== id)
          .map((i) => (i.parent === id ? { ...i, parent: undefined } : i)),
      })),
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

  /**
   * Commits grid geometry. Moving a group carries its docked children with it,
   * and any node dropped inside a group's footprint is adopted by that group.
   */
  const applyBoxes = useCallback(
    (boxes: { i: string; x: number; y: number; w: number; h: number }[]) =>
      update((l) => {
        const byId = new Map(boxes.map((b) => [b.i, b]));
        let items = l.items.map((it) => {
          const found = byId.get(it.i);
          return found ? { ...it, x: found.x, y: found.y, w: found.w, h: found.h } : it;
        });

        for (const prev of l.items) {
          if (!isGroupId(prev.i)) continue;
          const next = byId.get(prev.i);
          if (!next) continue;
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          if (!dx && !dy) continue;
          items = items.map((it) =>
            it.parent === prev.i && it.i !== prev.i ? { ...it, x: it.x + dx, y: it.y + dy } : it,
          );
        }

        const groups = items.filter((g) => isGroupId(g.i));
        const inside = (it: LayoutBox, g: LayoutBox) => {
          const cx = it.x + it.w / 2;
          const cy = it.y + it.h / 2;
          return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
        };
        items = items.map((it) => {
          if (isGroupId(it.i)) return it;
          const host = groups.find((g) => inside(it, g));
          if (host) return it.parent === host.i ? it : { ...it, parent: host.i };
          return it.parent ? { ...it, parent: undefined } : it;
        });

        return { ...l, items };
      }),
    [update],
  );

  const save = useCallback(() => {
    const next = draft ?? saved;
    if (!next) return;
    void writeLayout(terminal, next);
    setSaved(next);
    setDraft(null);
    setEditing(false);
    setPreviewing(false);
  }, [draft, saved, terminal]);

  const reset = useCallback(() => {
    void writeLayout(terminal, null);
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
    addGroup,
    setCanvas,
    removeModule,
    setOptions,
    setAllPadding,
    applyBoxes,
    save,
    reset,
  };
}
