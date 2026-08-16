/**
 * Payment Methods manager.
 *
 * The tenders offered at the till are data, not code: an administrator can add
 * a new collection type, rename one, reorder the buttons, mark one as needing a
 * serial number (government vouchers, coupons, transfer slips), switch one off
 * for a while, or delete it outright. Historical bills keep the method code
 * they were taken on, so reports stay intact after a tender is retired.
 */
import { useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  blankPaymentType,
  deletePaymentType,
  loadPaymentTypes,
  paymentCodeFrom,
  savePaymentType,
  type PaymentType,
} from "@/lib/payment-types";

export function PaymentMethodsPanel() {
  const [rows, setRows] = useState<PaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPaymentTypes().then((list) => {
      if (!alive) return;
      setRows(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patch = (id: string, p: Partial<PaymentType>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const save = async (row: PaymentType) => {
    setBusy(row.id);
    const res = await savePaymentType(row);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not save the payment method");
      return;
    }
    toast.success(`${row.name || "Payment method"} saved`);
    setRows(await loadPaymentTypes());
  };

  const remove = async (row: PaymentType) => {
    if (!window.confirm(`Delete "${row.name}"? Past bills taken on it keep their record.`)) return;
    setBusy(row.id);
    const res = await deletePaymentType(row.id);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not delete the payment method");
      return;
    }
    toast.success("Payment method deleted");
    setRows(await loadPaymentTypes());
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading payment methods…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={row.name}
              placeholder="Method name"
              onChange={(e) =>
                patch(row.id, {
                  name: e.target.value,
                  code: row.system ? row.code : paymentCodeFrom(e.target.value),
                })
              }
              className="h-9"
            />
            {row.system && <Badge variant="secondary">Built in</Badge>}
            <div className="flex items-center gap-2">
              <Switch
                checked={row.active}
                onCheckedChange={(v) => patch(row.id, { active: v })}
                aria-label="Available at checkout"
              />
              <span className="text-xs text-muted-foreground">
                {row.active ? "Available" : "Hidden"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Code</Label>
              <Input
                value={row.code}
                disabled={row.system}
                onChange={(e) => patch(row.id, { code: paymentCodeFrom(e.target.value) })}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Icon</Label>
              <Input
                value={row.icon}
                onChange={(e) => patch(row.id, { icon: e.target.value })}
                placeholder="Wallet"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order</Label>
              <Input
                value={row.sort}
                inputMode="numeric"
                onChange={(e) =>
                  patch(row.id, { sort: Number.isFinite(+e.target.value) ? +e.target.value : 0 })
                }
                className="numeric h-9"
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                checked={row.requiresReference}
                onCheckedChange={(v) => patch(row.id, { requiresReference: v })}
                aria-label="Requires a serial or reference number"
              />
              <span className="text-xs text-muted-foreground">
                Needs a serial / voucher number
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {!row.system && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(row)}
                disabled={busy === row.id}
              >
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            )}
            <Button size="sm" onClick={() => void save(row)} disabled={busy === row.id}>
              {busy === row.id ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 size-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        onClick={() =>
          setRows((rs) => [...rs, blankPaymentType(((rs.at(-1)?.sort ?? 0) as number) + 10)])
        }
      >
        <Plus className="mr-1 size-4" /> Add payment method
      </Button>
      <p className="text-xs text-muted-foreground">
        A method marked “needs a serial / voucher number” makes the cashier type the voucher or slip
        reference before the sale can be completed. That reference is stored against the bill.
      </p>
    </div>
  );
}
