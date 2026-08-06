import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { Label } from "@/components/ui/label";
import { money, stockAt, usePos } from "@/lib/pos-store";
import type { Product } from "@/lib/pos-types";

/**
 * Folds duplicate catalogue records (same item received twice under different
 * barcodes) into one master. Stock is added together and the losing barcodes
 * stay scannable as aliases.
 */
export function MergeProductsDialog({
  open,
  products,
  onOpenChange,
  onMerged,
}: {
  open: boolean;
  products: Product[];
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
}) {
  const { mergeProducts, currentStore } = usePos();
  const [masterId, setMasterId] = useState(products[0]?.id ?? "");

  useEffect(() => {
    if (open) setMasterId(products[0]?.id ?? "");
  }, [open, products]);

  const master = products.find((p) => p.id === masterId);
  const losers = products.filter((p) => p.id !== masterId);
  const totalStock = products.reduce((a, p) => a + stockAt(p, currentStore.id), 0);
  const aliases = [
    ...new Set(
      losers.flatMap((p) => [p.barcode, p.sku, ...(p.barcodes ?? [])].filter(Boolean)),
    ),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate products</DialogTitle>
          <DialogDescription>
            Keep one record and fold the others into it. Stock is added together and every old
            barcode keeps scanning to the item you keep.
          </DialogDescription>
        </DialogHeader>

        {products.length < 2 ? (
          <p className="text-sm text-muted-foreground">Select at least two products to merge.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Record to keep</Label>
              <ThemedSelect
                value={masterId}
                onChange={setMasterId}
                ariaLabel="Product record to keep"
                options={products.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${p.barcode || p.sku}`,
                }))}
              />
            </div>

            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{master?.name}</p>
              <p className="text-muted-foreground">
                Combined stock at {currentStore.code}:{" "}
                <span className="numeric">{totalStock}</span> · price{" "}
                <span className="numeric">{money(master?.price ?? 0)}</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Barcodes kept as aliases</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {aliases.map((code) => (
                  <Badge key={code} variant="outline" className="numeric text-[10px]">
                    {code}
                  </Badge>
                ))}
                {!aliases.length && <span className="text-xs">—</span>}
              </div>
            </div>

            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              These {losers.length} record{losers.length > 1 ? "s" : ""} will be removed:
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {losers.map((p) => (
                  <li key={p.id}>
                    {p.name} · {p.barcode || p.sku}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={products.length < 2 || !masterId}
            onClick={() => {
              mergeProducts(
                masterId,
                losers.map((p) => p.id),
              );
              toast.success(`Merged ${losers.length + 1} records into ${master?.name}`);
              onOpenChange(false);
              onMerged?.();
            }}
          >
            Merge products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
