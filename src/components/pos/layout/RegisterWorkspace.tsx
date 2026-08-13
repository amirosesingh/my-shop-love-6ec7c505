/**
 * Register workspace.
 *
 * Renders either the factory three-column till or an admin-authored atomic
 * canvas. Each element is supplied by the register route, so a control keeps
 * its handlers, permissions and state wherever it is placed.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Responsive, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Eye, GripVertical, LayoutGrid, List, PanelLeftOpen, Pencil, RotateCcw, Save, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/pos-auth";
import {
  GRID_COLS,
  useRegisterLayout,
  type LayoutBox,
  type ModuleFont,
  type ModuleOptions,
  type ModuleStyle,
  type ModuleTone,
} from "@/lib/register-layout";
import { MODULE_BY_ID, isRegisterModuleId, type RegisterModuleId } from "@/lib/register-modules";
import { FeaturePalette } from "./FeaturePalette";
import { NodeOptionsProvider } from "./node-options";

export type RegisterSlots = Record<RegisterModuleId, ReactNode>;

const FONT_CLASS: Record<ModuleFont, string> = {
  sm: "text-[12px]",
  md: "",
  lg: "text-[15px]",
  xl: "text-[18px]",
};

/** Tone recolours the control inside the node using semantic tokens only. */
const TONE_CLASS: Record<ModuleTone, string> = {
  neutral: "",
  primary: "[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:border-transparent",
  success: "[&_button]:bg-success [&_button]:text-success-foreground [&_button]:border-transparent",
  warning: "[&_button]:bg-warning [&_button]:text-warning-foreground [&_button]:border-transparent",
  destructive: "[&_button]:bg-destructive [&_button]:text-destructive-foreground [&_button]:border-transparent",
};

const DOT_GRID =
  "bg-[radial-gradient(color-mix(in_oklab,var(--primary)_28%,transparent)_1px,transparent_1px)] [background-size:13px_13px]";

export function RegisterWorkspace({
  slots,
  terminalKey,
  classic,
}: {
  slots: RegisterSlots;
  terminalKey: string;
  /** The untouched factory screen, used whenever no custom layout is saved. */
  classic: ReactNode;
}) {
  const { isAdmin } = useAuth();
  const layout = useRegisterLayout(terminalKey);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState<RegisterModuleId | null>(null);
  const { containerRef, width } = useContainerWidth();

  const editing = isAdmin && layout.editing;
  const showCanvas = !!layout.active && (editing || layout.previewing || !!layout.saved);

  const boxes = useMemo<Layout>(
    () =>
      (layout.active?.items ?? []).map((it) => ({
        i: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        minW: MODULE_BY_ID[it.i].minW,
        minH: MODULE_BY_ID[it.i].minH,
        static: !editing,
      })),
    [layout.active, editing],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {isAdmin && (
        <CustomizeBar
          editing={editing}
          previewing={layout.previewing}
          custom={!!layout.saved}
          onEdit={() => {
            layout.startEdit();
            setPaletteOpen(true);
          }}
          onCancel={() => {
            layout.stopEdit();
            setPaletteOpen(false);
          }}
          onPalette={() => setPaletteOpen((v) => !v)}
          onPreview={layout.preview}
          onResume={layout.resumeEdit}
          onSave={() => {
            layout.save();
            setPaletteOpen(false);
            toast.success("Layout saved for this terminal");
          }}
          onReset={() => {
            layout.reset();
            setPaletteOpen(false);
            toast.success("Restored the factory register layout");
          }}
        />
      )}

      <FeaturePalette
        open={isAdmin && editing && paletteOpen}
        onOpenChange={setPaletteOpen}
        modules={layout.palette}
        onAdd={(id) => layout.addModule(id)}
        onDragStart={setDragging}
      />

      {!showCanvas ? (
        <div className="min-h-0 flex-1">{classic}</div>
      ) : (
        <div
          ref={containerRef}
          className={`min-h-0 flex-1 overflow-auto bg-background ${editing ? DOT_GRID : ""}`}
          onDragOver={(e) => {
            if (editing && dragging) e.preventDefault();
          }}
        >
          <Responsive
            width={width || 1200}
            className="pos-scaled"
            breakpoints={{ lg: 1200, md: 900, sm: 0 }}
            cols={{ lg: GRID_COLS, md: 16, sm: 8 }}
            rowHeight={20}
            margin={[6, 6]}
            layouts={{ lg: boxes, md: boxes, sm: boxes }}
            dragConfig={{ enabled: editing, handle: ".rgl-drag-handle" }}
            resizeConfig={{ enabled: editing }}
            dropConfig={{
              enabled: editing,
              ...(dragging ? { defaultItem: { w: MODULE_BY_ID[dragging].w, h: MODULE_BY_ID[dragging].h } } : {}),
            }}
            onDrop={(_l, item) => {
              if (!dragging) return;
              layout.addModule(dragging, { x: item?.x ?? 0, y: item?.y ?? 0 });
              setDragging(null);
            }}
            onLayoutChange={(next: Layout) => {
              if (editing) layout.applyBoxes(next.map((b) => ({ i: String(b.i), x: b.x, y: b.y, w: b.w, h: b.h })));
            }}
          >
            {(layout.active?.items ?? []).map((box) => (
              <div key={box.i} className="min-h-0 min-w-0">
                <CanvasItem
                  box={box}
                  editing={editing}
                  onRemove={() => {
                    if (MODULE_BY_ID[box.i].essential) {
                      toast.warning(`${MODULE_BY_ID[box.i].label} removed — the till cannot take payment without it.`);
                    }
                    layout.removeModule(box.i);
                  }}
                  onOptions={(opts) => layout.setOptions(box.i, opts)}
                >
                  {slots[box.i]}
                </CanvasItem>
              </div>
            ))}
          </Responsive>
        </div>
      )}
    </div>
  );
}

function CanvasItem({
  box,
  editing,
  onRemove,
  onOptions,
  children,
}: {
  box: LayoutBox;
  editing: boolean;
  onRemove: () => void;
  onOptions: (opts: ModuleOptions) => void;
  children: ReactNode;
}) {
  const def = isRegisterModuleId(box.i) ? MODULE_BY_ID[box.i] : null;
  if (!def) return null;
  const panel = def.chrome !== "bare";
  return (
    <section
      className={`group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${
        panel ? "rounded-lg border border-border bg-card" : ""
      } ${editing ? "rounded-lg outline-2 outline-dashed outline-primary/50" : ""} ${FONT_CLASS[box.font ?? "md"]} ${
        TONE_CLASS[box.tone ?? "neutral"]
      }`}
      data-view={box.view ?? "list"}
    >
      {editing && (
        <div className="absolute right-1 top-1 z-20 flex items-center gap-0.5 rounded-md border border-primary/40 bg-background/95 px-1 py-0.5 opacity-70 shadow-sm transition-opacity group-hover:opacity-100">
          <span
            className="rgl-drag-handle flex cursor-grab items-center px-0.5 text-primary active:cursor-grabbing"
            title={def.label}
          >
            <GripVertical className="size-3.5" />
          </span>
          <Inspector box={box} label={def.label} supportsView={!!def.supportsView} supportsLabel={!!def.supportsLabel} onOptions={onOptions} />
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-destructive hover:text-destructive"
            aria-label={`Remove ${def.label}`}
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
      <div className={`min-h-0 flex-1 ${panel ? "overflow-auto" : "overflow-hidden"}`}>
        <NodeOptionsProvider
          value={{
            ...(box.label ? { label: box.label } : {}),
            ...(box.style ? { style: box.style } : {}),
          }}
        >
          {children}
        </NodeOptionsProvider>
      </div>
    </section>
  );
}

function Inspector({
  box,
  label,
  supportsView,
  supportsLabel,
  onOptions,
}: {
  box: LayoutBox;
  label: string;
  supportsView: boolean;
  supportsLabel: boolean;
  onOptions: (opts: ModuleOptions) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="size-6" aria-label={`${label} options`}>
          <Settings2 className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {supportsLabel && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Custom label</p>
            <Input
              value={box.label ?? ""}
              placeholder={label}
              className="h-8 text-sm"
              onChange={(e) => onOptions({ label: e.target.value })}
            />
          </div>
        )}
        {supportsView && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">View</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={(box.view ?? "list") === "grid" ? "default" : "outline"}
                className="h-8 flex-1"
                onClick={() => onOptions({ view: "grid" })}
              >
                <LayoutGrid className="size-3.5" /> Grid
              </Button>
              <Button
                size="sm"
                variant={(box.view ?? "list") === "list" ? "default" : "outline"}
                className="h-8 flex-1"
                onClick={() => onOptions({ view: "list" })}
              >
                <List className="size-3.5" /> List
              </Button>
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Colour tone</p>
          <div className="flex flex-wrap gap-1.5">
            {(["neutral", "primary", "success", "warning", "destructive"] as ModuleTone[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={(box.tone ?? "neutral") === t ? "default" : "outline"}
                className="h-7 px-2 text-[11px] capitalize"
                onClick={() => onOptions({ tone: t })}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Display</p>
          <div className="flex gap-1.5">
            {(
              [
                ["both", "Icon + text"],
                ["text", "Text only"],
                ["icon", "Icon only"],
              ] as [ModuleStyle, string][]
            ).map(([v, l]) => (
              <Button
                key={v}
                size="sm"
                variant={(box.style ?? "both") === v ? "default" : "outline"}
                className="h-7 flex-1 px-1 text-[11px]"
                onClick={() => onOptions({ style: v })}
              >
                {l}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Font size</p>
          <div className="flex gap-1.5">
            {(["sm", "md", "lg", "xl"] as ModuleFont[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={(box.font ?? "md") === f ? "default" : "outline"}
                className="h-7 flex-1 px-1 text-[11px]"
                onClick={() => onOptions({ font: f })}
              >
                {f === "sm" ? "S" : f === "md" ? "M" : f === "lg" ? "L" : "XL"}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CustomizeBar({
  editing,
  previewing,
  custom,
  onEdit,
  onCancel,
  onPalette,
  onPreview,
  onResume,
  onSave,
  onReset,
}: {
  editing: boolean;
  previewing: boolean;
  custom: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onPalette: () => void;
  onPreview: () => void;
  onResume: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  if (!editing && !previewing) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border bg-background px-3 py-1.5">
        {custom && (
          <span className="mr-auto text-[11px] text-muted-foreground">Custom layout active on this terminal</span>
        )}
        <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
          <Pencil className="size-3.5" /> Customize layout
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/10 px-3 py-1.5">
      <span className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-primary">
        {previewing ? "Live preview — tap controls to test" : "Edit mode — drag, resize, restyle or remove elements"}
      </span>
      {editing && (
        <Button size="sm" variant="outline" className="h-8" onClick={onPalette}>
          <PanelLeftOpen className="size-3.5" /> Feature hub
        </Button>
      )}
      {editing ? (
        <Button size="sm" variant="outline" className="h-8" onClick={onPreview}>
          <Eye className="size-3.5" /> Live preview
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="h-8" onClick={onResume}>
          <Pencil className="size-3.5" /> Back to editing
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-8" onClick={onReset}>
        <RotateCcw className="size-3.5" /> Factory default
      </Button>
      <Button size="sm" className="h-8" onClick={onSave}>
        <Save className="size-3.5" /> Save layout
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
