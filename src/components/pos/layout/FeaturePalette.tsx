/** Feature Component Hub — the drawer of till controls an admin can drop in. */
import { GripVertical, Plus, PlusCircle, SquareDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { REGISTER_CATEGORIES, type RegisterModule, type RegisterModuleId } from "@/lib/register-modules";

export function FeaturePalette({
  open,
  onOpenChange,
  modules,
  onAdd,
  onDragStart,
  onCreate,
  onAddGroup,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modules: RegisterModule[];
  onAdd: (id: RegisterModuleId) => void;
  onDragStart: (id: RegisterModuleId) => void;
  onCreate: () => void;
  /** Drops an empty group container that other nodes can be docked into. */
  onAddGroup: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        /* Right side and non-blocking so the whole canvas — including the far
           right edge — stays reachable while the hub is open. */
        className="w-[340px] sm:max-w-none"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Feature hub</SheetTitle>
          <SheetDescription>Drag a control onto the till, or tap add to drop it at the bottom.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-9rem)] pr-3">
          <div className="space-y-5">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onCreate}>
              <PlusCircle className="size-4" /> Create new action button
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onAddGroup}>
              <SquareDashed className="size-4" /> Add group box
            </Button>
            {REGISTER_CATEGORIES.map((cat) => {
              const items = modules.filter((m) => m.category === cat);
              return (
                <div key={cat}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">All placed on the screen.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((m) => (
                        <div
                          key={m.id}
                          draggable
                          unselectable="on"
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", m.id);
                            onDragStart(m.id);
                          }}
                          className="flex cursor-grab items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-card p-3 active:cursor-grabbing"
                        >
                          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.label}</p>
                            <p className="text-[11px] text-muted-foreground">{m.blurb}</p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 shrink-0"
                            aria-label={`Add ${m.label}`}
                            onClick={() => onAdd(m.id)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}