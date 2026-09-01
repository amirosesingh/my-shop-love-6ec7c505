/**
 * One dialog for the three points where a transfer changes hands: approving
 * it, sending it, and booking it in. Each step shows what the step before
 * promised and lets the person doing the work type what is actually true —
 * never more than the step before allowed.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Transfer } from "@/lib/pos-types";

export type TransferStep = "approve" | "dispatch" | "receive";

const COPY: Record<TransferStep, { title: string; blurb: string; column: string; cta: string }> = {
  approve: {
    title: "Approve transfer",
    blurb: "Allow all of it, or cut a line back before anything is picked.",
    column: "Approve",
    cta: "Approve",
  },
  dispatch: {
    title: "Dispatch transfer",
    blurb:
      "Enter what is physically going in the box. The request closes on what you send — a short send stays short.",
    column: "Sending",
    cta: "Dispatch",
  },
  receive: {
    title: "Receive transfer",
    blurb: "Count what arrived. Anything missing is recorded against the note.",
    column: "Received",
    cta: "Receive",
  },
};

/** The most this step may claim, taken from the step before it. */
const ceilingFor = (step: TransferStep, i: Transfer["items"][number]) =>
  step === "approve"
    ? i.qty
    : step === "dispatch"
      ? (i.approvedQty ?? i.qty)
      : (i.dispatchedQty ?? i.approvedQty ?? i.qty);

export function TransferStepDialog({
  step,
  transfer,
  nameOf,
  onConfirm,
  onClose,
}: {
  step: TransferStep;
  transfer: Transfer | null;
  nameOf: (productId: string) => string;
  onConfirm: (lines: { productId: string; qty: number }[]) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!transfer) return;
    setQty(Object.fromEntries(transfer.items.map((i) => [i.productId, ceilingFor(step, i)])));
  }, [transfer, step]);

  const copy = COPY[step];
  const total = useMemo(
    () => Object.values(qty).reduce((a, n) => a + (Number(n) || 0), 0),
    [qty],
  );
  const asked = transfer?.items.reduce((a, i) => a + i.qty, 0) ?? 0;
  const short = transfer ? total < asked : false;

  if (!transfer) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.title} · <span className="numeric">{transfer.ref}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{copy.blurb}</p>
        <Separator />
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {transfer.items.map((i) => {
            const cap = ceilingFor(step, i);
            return (
              <div key={i.productId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{nameOf(i.productId)}</div>
                  <div className="numeric text-[11px] text-muted-foreground">
                    asked {i.qty}
                    {i.approvedQty !== undefined && ` · approved ${i.approvedQty}`}
                    {i.dispatchedQty !== undefined && ` · sent ${i.dispatchedQty}`}
                  </div>
                </div>
                <div className="w-24">
                  <Label className="sr-only">{copy.column}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={cap}
                    className="numeric text-right"
                    value={qty[i.productId] ?? 0}
                    onChange={(e) =>
                      setQty((prev) => ({
                        ...prev,
                        [i.productId]: Math.max(
                          0,
                          Math.min(cap, Math.floor(Number(e.target.value) || 0)),
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        {short && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {step === "dispatch"
              ? "This is a part send. The note will close on this quantity — the shortfall is not carried forward."
              : "This is less than was asked for. The difference is recorded on the note."}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm(
                transfer.items.map((i) => ({
                  productId: i.productId,
                  qty: Math.max(0, Math.min(ceilingFor(step, i), qty[i.productId] ?? 0)),
                })),
              )
            }
          >
            {copy.cta} · <span className="numeric">{total}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rejecting or cancelling always needs a written reason. */
export function TransferReasonDialog({
  transfer,
  cancelling,
  onConfirm,
  onClose,
}: {
  transfer: Transfer | null;
  cancelling: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [transfer]);
  if (!transfer) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cancelling ? "Cancel transfer" : "Reject transfer"} ·{" "}
            <span className="numeric">{transfer.ref}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {cancelling
            ? "Goods already sent go back to the sending branch. Say why, for the record."
            : "The branch that asked will see this reason on the note."}
        </p>
        <div className="space-y-1">
          <Label htmlFor="transfer-reason">Reason</Label>
          <Input
            id="transfer-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Out of stock at the sending branch"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it open
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {cancelling ? "Cancel transfer" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
