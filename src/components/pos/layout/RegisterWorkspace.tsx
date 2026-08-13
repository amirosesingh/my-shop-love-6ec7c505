/**
 * Register workspace.
 *
 * Renders either the factory three-column till or an admin-authored canvas.
 * The blocks themselves are supplied by the register route, so a module keeps
 * its handlers, permissions and state wherever it is placed.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Responsive, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
  Eye,
  LayoutGrid,
  List,
  PanelLeftOpen,
  Pencil,
  RotateCcw,
  Save,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/pos-auth";
import { useRegisterLayout, type LayoutBox, type ModuleFont } from "@/lib/register-layout";
import { MODULE_BY_ID, isRegisterModuleId, type RegisterModuleId } from "@/lib/register-modules";
import { FeaturePalette } from "./FeaturePalette";

export type RegisterSlots = Record<RegisterModuleId, ReactNode>;

const FONT_CLASS: Record<ModuleFont, string> = {
  sm: "text-[13px]",
  md: "",
  lg: "text-[15px]",
};

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
          className={`min-h-0 flex-1 overflow-auto ${editing ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,color-mix(in_oklab,var(--primary)_6%,transparent)_10px,color-mix(in_oklab,var(--primary)_6%,transparent)_20px)]" : ""}`}
          onDragOver={(e) => {
            if (editing && dragging) e.preventDefault();
          }}
        >
          <Responsive
            width={width || 1200}
            className="pos-scaled"
            breakpoints={{ lg: 1200, md: 900, sm: 0 }}
            cols={{ lg: 12, md: 8, sm: 4 }}
            rowHeight={28}
            margin={[10, 10]}
            layouts={{ lg: boxes, md: boxes, sm: boxes }}
            dragConfig={{ enabled: editing, handle: ".rgl-drag-handle" }}
            resizeConfig={{ enabled: editing }}
            dropConfig={{
              enabled: editing,
              ...(dragging
                ? { defaultItem: { w: MODULE_BY_ID[dragging].w, h: MODULE_BY_ID[dragging].h } }
                : {}),
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
  onOptions: (opts: { view?: "grid" | "list"; font?: ModuleFont }) => void;
  children: ReactNode;
}) {
  const def = isRegisterModuleId(box.i) ? MODULE_BY_ID[box.i] : null;
  if (!def) return null;
  return (
    <section
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card ${
        editing ? "border-2 border-dashed border-primary/60" : "border-border"
      } ${FONT_CLASS[box.font ?? "md"]}`}
      data-view={box.view ?? "list"}
    >
      {editing && (
        <div className="rgl-drag-handle flex cursor-grab items-center justify-between gap-2 border-b border-border bg-primary/10 px-2 py-1 active:cursor-grabbing">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">{def.label}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="size-6" aria-label={`${def.label} display options`}>
                  <Settings2 className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 space-y-3">
                {def.hasDisplayOptions && (
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
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Font size
                  </p>
                  <div className="flex gap-2">
                    {(["sm", "md", "lg"] as ModuleFont[]).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={(box.font ?? "md") === f ? "default" : "outline"}
                        className="h-8 flex-1"
                        onClick={() => onOptions({ font: f })}
                      >
                        {f === "sm" ? "Small" : f === "md" ? "Medium" : "Large"}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
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
        {custom && <span className="mr-auto text-[11px] text-muted-foreground">Custom layout active on this terminal</span>}
        <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
          <Pencil className="size-3.5" /> Customize layout
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/10 px-3 py-1.5">
      <span className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-primary">
        {previewing ? "Live preview — tap controls to test" : "Edit mode — drag, resize or remove blocks"}
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