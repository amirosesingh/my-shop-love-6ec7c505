import type { FormEvent } from "react";
import { Info, Lock, MonitorPlay, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { money, stockAt } from "@/lib/pos-store";
import type { Product } from "@/lib/pos-types";

/** Product search + tap-to-add grid. Rendered inline on wide screens and
 *  inside a dialog when the till window is too narrow for two columns. */
export function CatalogPanel({
  query,
  onQueryChange,
  onScanSubmit,
  categories,
  category,
  onCategoryChange,
  products,
  storeId,
  storeName,
  shiftOpen,
  onAdd,
  onDetail,
  onOpenCustomerDisplay,
  onOpenShift,
  onCloseShift,

  showHeaderActions = true,
  autoFocus = true,
  showSearch = true,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onScanSubmit: (e: FormEvent) => void;
  categories: string[];
  category: string;
  onCategoryChange: (c: string) => void;
  products: Product[];
  storeId: string;
  storeName: string;
  shiftOpen: boolean;
  onAdd: (id: string) => void;
  onDetail: (id: string) => void;
  onOpenCustomerDisplay?: () => void;
  onOpenShift?: () => void;
  onCloseShift?: () => void;
  showHeaderActions?: boolean;
  autoFocus?: boolean;

  /** hidden on the till, where the dedicated scan bar above the cart is used */
  showSearch?: boolean;
}) {
  return (
    <>
      <div
        className={
          showSearch
            ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
            : "flex items-center justify-start gap-2"
        }
      >
        {showSearch && (
          <form onSubmit={onScanSubmit} className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus={autoFocus}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Scan barcode or search products…"
              className="numeric h-11 pl-9"
            />
          </form>
        )}
        {showHeaderActions && (
          <div className="flex shrink-0 gap-2">
            {shiftOpen && onCloseShift && (
              <Button variant="outline" className="h-11" onClick={onCloseShift}>
                <Lock className="size-4" />
                <span className="hidden xl:inline">Close shift</span>
              </Button>
            )}
            {!shiftOpen && onOpenShift && (
              <Button className="h-11" onClick={onOpenShift}>
                <Lock className="size-4" />
                <span className="hidden xl:inline">Open shift</span>
              </Button>
            )}
            {onOpenCustomerDisplay && (
              <Button variant="outline" className="h-11" onClick={onOpenCustomerDisplay}>
                <MonitorPlay className="size-4" />
                <span className="hidden xl:inline">Customer screen</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {!shiftOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Lock className="size-4" />
          <span>Selling is locked at {storeName}. Open a shift to ring up sales.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="grid grid-cols-2 gap-3 pb-6 xl:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="relative">
              <button
                onClick={() => onAdd(p.id)}
                disabled={!shiftOpen}
                className="group flex h-full w-full flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card"
              >
                <span className="pr-6 text-sm font-medium leading-snug">{p.name}</span>
                <span className="mt-2 flex items-center justify-between">
                  <span className="numeric text-base font-semibold text-primary">
                    {money(p.price)}
                  </span>
                  <span
                    className={`numeric text-[11px] ${
                      stockAt(p, storeId) <= p.reorderLevel
                        ? "text-warning"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stockAt(p, storeId)} left
                  </span>
                </span>
              </button>
              <button
                aria-label={`Stock across stores for ${p.name}`}
                onClick={() => onDetail(p.id)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <Info className="size-3.5" />
              </button>
            </div>
          ))}
          {products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No products match “{query}”.
            </p>
          )}
        </div>
      </ScrollArea>
    </>
  );
}