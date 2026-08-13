/**
 * Properties drawer for creating an admin-authored till button: title, display
 * mode, padding, icon, colour and the page/modal/action it fires.
 */
import { useState } from "react";
import { icons, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ACTION_CATEGORIES, REGISTER_ACTIONS } from "@/lib/register-actions";
import {
  DEFAULT_PAD,
  MAX_PAD,
  type CustomButtonSpec,
  type ModuleStyle,
  type ModuleTone,
} from "@/lib/register-layout";
import { CUSTOM_ICONS } from "./CustomActionButton";

const TONES: ModuleTone[] = ["neutral", "primary", "success", "warning", "destructive"];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function CustomButtonDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (spec: CustomButtonSpec, opts: { tone?: ModuleTone; style?: ModuleStyle; pad?: number }) => void;
}) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("Zap");
  const [action, setAction] = useState(REGISTER_ACTIONS[0]!.id);
  const [style, setStyle] = useState<ModuleStyle>("both");
  const [tone, setTone] = useState<ModuleTone>("neutral");
  const [hex, setHex] = useState("");
  const [pad, setPad] = useState(DEFAULT_PAD);

  const submit = () => {
    const chosen = REGISTER_ACTIONS.find((a) => a.id === action);
    onCreate(
      {
        label: label.trim() || chosen?.label || "Action",
        icon,
        action,
        ...(HEX.test(hex) ? { color: hex } : {}),
      },
      { tone, style, pad },
    );
    setLabel("");
    setHex("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Create action button</DialogTitle>
        </DialogHeader>
        <ScrollArea className="-mr-3 max-h-[62vh] pr-3">
          <div className="space-y-4">
            <div>
              <Label htmlFor="cb-title">Button title</Label>
              <Input
                id="cb-title"
                value={label}
                placeholder="Manage bookings"
                className="mt-1"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="cb-action">Target action or page</Label>
              <select
                id="cb-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {ACTION_CATEGORIES.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {REGISTER_ACTIONS.filter((a) => a.category === cat).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                        {a.hotkey ? ` (${a.hotkey})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Display mode</p>
              <div className="flex gap-2">
                {(
                  [
                    ["both", "Text + icon"],
                    ["text", "Text only"],
                    ["icon", "Icon only"],
                  ] as [ModuleStyle, string][]
                ).map(([v, l]) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={style === v ? "default" : "outline"}
                    className="h-8 flex-1"
                    onClick={() => setStyle(v)}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Icon</p>
              <div className="grid grid-cols-10 gap-1">
                {CUSTOM_ICONS.map((name) => {
                  const Icon = (icons as Record<string, typeof Zap>)[name] ?? Zap;
                  return (
                    <Button
                      key={name}
                      type="button"
                      size="icon"
                      variant={icon === name ? "default" : "outline"}
                      className="size-8"
                      aria-label={name}
                      onClick={() => setIcon(name)}
                    >
                      <Icon className="size-4" />
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Colour theme</p>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={tone === t && !HEX.test(hex) ? "default" : "outline"}
                    className="h-7 px-2 text-[11px] capitalize"
                    onClick={() => {
                      setTone(t);
                      setHex("");
                    }}
                  >
                    {t}
                  </Button>
                ))}
                <Input
                  value={hex}
                  placeholder="#0f766e"
                  className="h-7 w-28 text-xs"
                  aria-label="Custom hex colour"
                  onChange={(e) => setHex(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cb-pad">Inner padding — {pad}px</Label>
              <input
                id="cb-pad"
                type="range"
                min={0}
                max={MAX_PAD}
                step={1}
                value={pad}
                className="mt-2 w-full accent-primary"
                onChange={(e) => setPad(Number(e.target.value))}
              />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Add to canvas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
