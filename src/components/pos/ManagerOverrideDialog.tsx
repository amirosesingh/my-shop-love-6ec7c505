import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyManagerPin } from "@/lib/pos-rules.functions";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";

export type OverrideRequest = {
  action: string;
  ruleKey?: string;
  title: string;
  reason: string;
  storeId?: string | null;
  terminalId?: string | null;
  requestedBy?: string | null;
  detail?: string;
};

/**
 * Manager PIN gate. The PIN is posted to the server and compared inside the
 * database — nothing is validated in the browser — and the signed grant it
 * returns is what later server calls accept as proof of the override.
 */
export function ManagerOverrideDialog({
  request,
  onClose,
  onApproved,
}: {
  request: OverrideRequest | null;
  onClose: () => void;
  onApproved: (grantToken: string, manager: { id: string; name: string }) => void;
}) {
  const [managerId, setManagerId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!request) return;
    setBusy(true);
    try {
      const auth = await getPosCallerAuth();
      const res = await verifyManagerPin({
        data: {
          ...auth,
          managerId: managerId.trim(),
          pin,
          action: request.action,
          ...(request.ruleKey ? { ruleKey: request.ruleKey } : {}),
          ...(request.requestedBy ? { requestedBy: request.requestedBy } : {}),
          ...(request.storeId ? { storeId: request.storeId } : {}),
          ...(request.terminalId ? { terminalId: request.terminalId } : {}),
          ...(request.detail ? { detail: request.detail } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Authorisation failed");
        return;
      }
      toast.success(`Approved by ${res.manager.name}`);
      onApproved(res.grantToken, { id: res.manager.id, name: res.manager.name });
      setManagerId("");
      setPin("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Authorisation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> {request?.title ?? "Manager approval"}
          </DialogTitle>
          <DialogDescription>{request?.reason}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Manager ID</Label>
            <Input
              value={managerId}
              autoFocus
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="e.g. manager1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Manager PIN</Label>
            <Input
              className="numeric"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || pin.length < 4 || !managerId.trim()}>
            {busy ? "Checking…" : "Authorise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}