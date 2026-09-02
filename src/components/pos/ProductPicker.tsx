/**
 * Product search for stock paperwork.
 *
 * A dropdown listing every catalogue row is useless once a shop carries a few
 * thousand items, so this is a type-to-filter list over name, barcode and SKU
 * that shows the on-hand figure at the branch doing the work. It only picks a
 * product — it never creates or edits one — so it is safe on every stock
 * screen.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/pos-types";
import { stockAt } from "@/lib/pos-store";

export function ProductPicker({
  products,
  storeId,
  storeCode,
  onPick,
  limit = 25,
  placeholder = "Search by name, barcode or SKU",
}: {
  products: Product[];
  storeId: string;
  storeCode?: string;
  onPick: (product: Product) => void;
  limit?: number;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const pool = needle
      ? products.filter((p) =>
          [p.name, p.barcode, p.sku].some((v) => v?.toLowerCase().includes(needle)),
        )
      : products;
    return pool.slice(0, limit);
  }, [products, term, limit]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Search products"
        />
      </div>
      <div className="max-h-52 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {matches.map((p) => (
          <Button
            key={p.id}
            variant="ghost"
            className="h-auto w-full justify-between rounded-none px-3 py-2 text-left"
            onClick={() => onPick(p)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{p.name}</span>
              <span className="numeric block truncate text-[11px] text-muted-foreground">
                {p.barcode || p.sku || "no code"}
              </span>
            </span>
            <span className="numeric shrink-0 text-xs text-muted-foreground">
              {stockAt(p, storeId)}
              {storeCode ? ` at ${storeCode}` : ""}
            </span>
          </Button>
        ))}
        {!matches.length && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing matches “{term}”.
          </p>
        )}
      </div>
    </div>
  );
}
