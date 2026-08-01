import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { money, stockAt, usePos } from "@/lib/pos-store";
import {
  STOCK_ADJUSTMENT_REASONS,
  r2,
  type Product,
  type StockAdjustmentReason,
} from "@/lib/pos-types";

const reasonOptions = STOCK_ADJUSTMENT_REASONS.map((r) => ({ value: r.value, label: r.label }));

/** Single-product adjustment: enter the counted figure, pick why it differs. */
export function StockAdjustDialog({
  product,
  storeId,
  onClose,
}: {
  product: Product | null;
  storeId: string;
  onClose: () => void;
}) {
  const { applyStockCount } = usePos();
  const system = product ? stockAt(product, storeId) : 0;
  const [counted, setCounted] = useState(String(system));
  const [reason, setReason] = useState<StockAdjustmentReason>("stock_count");
  const [note, setNote] = useState("");

  useEffect(() => {
    setCounted(String(system));
    setReason("stock_count");
    setNote("");
  }, [product?.id, system]);

  const delta = (Number(counted) || 0) - system;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock · {product?.name}</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">System count</Label>
                <Input className="numeric" value={system} readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Counted</Label>
                <Input
                  className="numeric"
                  autoFocus
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Difference</Label>
                <div className="flex h-9 items-center">
                  <Badge
                    variant="outline"
                    className={
                      delta === 0
                        ? "text-muted-foreground"
                        : delta > 0
                          ? "border-success/40 text-success"
                          : "border-destructive/40 text-destructive"
                    }
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <ThemedSelect
                ariaLabel="Adjustment reason"
                value={reason}
                onChange={(v) => setReason(v as StockAdjustmentReason)}
                options={reasonOptions}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cost impact {money(r2(delta * (product.cost ?? 0)))} · recorded in the audit trail
              with your name and the exact time.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!product || delta === 0}
            onClick={() => {
              if (!product) return;
              applyStockCount(
                [{ productId: product.id, counted: Number(counted) || 0 }],
                reason,
                note,
                storeId,
              );
              toast.success(`${product.name} stock set to ${Number(counted) || 0}`);
              onClose();
            }}
          >
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bulk stock check: type counted figures, review the variance, commit once. */
export function StockCountDialog({
  open,
  products,
  storeId,
  onClose,
}: {
  open: boolean;
  products: Product[];
  storeId: string;
  onClose: () => void;
}) {
  const { applyStockCount } = usePos();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<StockAdjustmentReason>("stock_count");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setCounts({});
      setNote("");
      setReason("stock_count");
    }
  }, [open]);

  const variances = useMemo(
    () =>
      products
        .filter((p) => counts[p.id] !== undefined && counts[p.id] !== "")
        .map((p) => {
          const system = stockAt(p, storeId);
          const counted = Math.max(0, Math.round(Number(counts[p.id]) || 0));
          return { product: p, system, counted, delta: counted - system };
        })
        .filter((v) => v.delta !== 0),
    [products, counts, storeId],
  );

  const over = variances.filter((v) => v.delta > 0).reduce((a, v) => a + v.delta, 0);
  const short = variances.filter((v) => v.delta < 0).reduce((a, v) => a + v.delta, 0);
  const valueImpact = r2(variances.reduce((a, v) => a + v.delta * (v.product.cost ?? 0), 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Stock check · {products.length} products</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <ThemedSelect
                ariaLabel="Stock check reason"
                value={reason}
                onChange={(v) => setReason(v as StockAdjustmentReason)}
                options={reasonOptions}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="w-32 text-right">Counted</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const system = stockAt(p, storeId);
                  const raw = counts[p.id];
                  const diff = raw === undefined || raw === "" ? null : (Number(raw) || 0) - system;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="numeric text-[11px] text-muted-foreground">{p.sku}</div>
                      </TableCell>
                      <TableCell className="numeric text-right">{system}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="numeric h-8 text-right"
                          placeholder="—"
                          value={raw ?? ""}
                          onChange={(e) =>
                            setCounts((c) => ({ ...c, [p.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                      <TableCell
                        className={`numeric text-right ${
                          diff === null || diff === 0
                            ? "text-muted-foreground"
                            : diff > 0
                              ? "text-success"
                              : "text-destructive"
                        }`}
                      >
                        {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label="Lines with variance" value={String(variances.length)} />
            <Summary label="Units over" value={`+${over}`} />
            <Summary label="Units short" value={String(short)} />
            <Summary label="Value impact" value={money(valueImpact)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!variances.length}
            onClick={() => {
              applyStockCount(
                variances.map((v) => ({ productId: v.product.id, counted: v.counted })),
                reason,
                note,
                storeId,
              );
              toast.success(`${variances.length} stock lines updated`);
              onClose();
            }}
          >
            Commit stock check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Summary = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="numeric text-lg font-semibold">{value}</p>
  </div>
);