/**
 * Confirmation modal for "Push settings to child branches".
 *
 * It summarises which keys the source scope overrides itself and which it is
 * only passing on from its parent, before anything is written downstream.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SETTING_BY_KEY, type ResolvedSetting, type SettingScope } from "@/lib/settings-scope";

export function PushToChildrenDialog({
  scope,
  scopeLabel,
  targets,
  settings,
  disabled,
  onConfirm,
}: {
  scope: SettingScope;
  scopeLabel: string;
  targets: { id: string; name: string }[];
  settings: ResolvedSetting[];
  disabled?: boolean;
  onConfirm: (keys: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const overridden = settings.filter((s) => s.isOverridden);
  const inherited = settings.filter((s) => !s.isOverridden);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(settings.map((s) => s.key));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Send className="size-4" /> Push to child branches
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Push settings to child branches</DialogTitle>
          <DialogDescription>
            Every branch under {scopeLabel} will be given these values as a branch override. Their
            current local values for these keys are replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            <span className="numeric">{targets.length}</span> branch(es) will be updated
            {scope === "CLUSTER" ? " in this cluster" : " across every cluster"}.
          </p>

          <Section
            title={`Overridden at ${scope === "GLOBAL" ? "Global" : "this cluster"}`}
            variant="default"
            keys={overridden}
          />
          <Section title="Passed on from the parent tier" variant="outline" keys={inherited} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {busy ? "Pushing…" : "Push settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  variant,
  keys,
}: {
  title: string;
  variant: "default" | "outline";
  keys: ResolvedSetting[];
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-semibold">
        {title} · <span className="numeric">{keys.length}</span>
      </p>
      {keys.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Nothing in this group.</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px]">
          {keys.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <span className="truncate">{SETTING_BY_KEY[s.key]?.label ?? s.key}</span>
              <Badge variant={variant} className="shrink-0 text-[10px]">
                {String(s.value)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}