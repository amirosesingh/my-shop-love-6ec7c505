/**
 * Calculator-style discount entry: five-step percentage presets plus a
 * keypad for a custom percentage or cash amount.
 */
import { useEffect, useState } from "react";
import { Delete, Percent, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DiscountType } from "@/core/types/pos-types";

const PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

export function DiscountPad({
  open,
  onOpenChange,
  title = "Apply discount",
  value,
  type,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: number;
  type: DiscountType;
  onApply: (value: number, type: DiscountType) => void;
}) {
  const [entry, setEntry] = useState(value ? String(value) : "");
  const [mode, setMode] = useState<DiscountType>(type);

  useEffect(() => {
    if (!open) return;
    setEntry(value ? String(value) : "");
    setMode(type);
  }, [open, value, type]);

  const numeric = Number(entry || 0);
  const invalid = mode === "percent" && numeric > 100;

  const push = (k: string) =>
    setEntry((e) => (k === "." && e.includes(".") ? e : (e + k).replace(/^0(?=\d)/, "")));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex overflow-hidden rounded-md border border-border">
          {(
            [
              { t: "percent" as const, label: "Percent", icon: Percent },
              { t: "amount" as const, label: "Amount", icon: DollarSign },
            ]
          ).map((o) => (
            <button
              key={o.t}
              onClick={() => setMode(o.t)}
              className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs ${
                mode === o.t
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <o.icon className="size-3.5" /> {o.label}
            </button>
          ))}
        </div>

        <div className="numeric rounded-md border border-border bg-surface-2 px-3 py-3 text-right text-2xl font-semibold">
          {entry || "0"}
          <span className="ml-1 text-base text-muted-foreground">
            {mode === "percent" ? "%" : ""}
          </span>
        </div>
        {invalid && (
          <p className="text-[11px] text-destructive">A percentage cannot go above 100.</p>
        )}

        {mode === "percent" && (
          <div className="grid grid-cols-5 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setEntry(String(p))}
                className={`rounded-md border py-2 text-xs transition-colors ${
                  entry === String(p)
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((k) => (
            <Button key={k} variant="outline" className="h-11 text-base" onClick={() => push(k)}>
              {k}
            </Button>
          ))}
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setEntry((e) => e.slice(0, -1))}
            aria-label="Backspace"
          >
            <Delete className="size-4" />
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onApply(0, mode);
              onOpenChange(false);
            }}
          >
            Clear
          </Button>
          <Button
            disabled={invalid}
            onClick={() => {
              onApply(numeric, mode);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}