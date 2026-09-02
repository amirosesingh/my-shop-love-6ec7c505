import { Button } from "@/components/ui/button";
import { ScanBar } from "@/platforms/web/components/pos/ScanBar";
import { lineUnitDiscount, r2, type CartLine } from "@/core/types/pos-types";

/**
 * The goods being reserved on a standard "book & pay later" booking.
 *
 * It is the same ticket the register holds — scanning or searching from here
 * adds to that one list, so the slip can never disagree with the screen.
 */
export function BookingCartPanel({
  lines,
  money,
  onScan,
  onSearch,
  onQty,
}: {
  lines: CartLine[];
  money: (n: number) => string;
  onScan: (code: string) => void;
  onSearch: () => void;
  onQty: (index: number, delta: number) => void;
}) {
  const units = lines.reduce((a, l) => a + l.qty, 0);
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Items being booked</span>
        <span className="text-[11px] text-muted-foreground">{units} unit(s)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ScanBar onScan={onScan} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onSearch}>
          Search
        </Button>
      </div>
      {!lines.length ? (
        <p className="rounded bg-muted/50 px-2 py-3 text-center text-xs text-muted-foreground">
          Scan a barcode or search the catalogue to add the item the customer is reserving.
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {lines.map((l, i) => (
            <div
              key={`${l.productId}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate">{l.name}</div>
                <div className="text-[11px] text-muted-foreground numeric">
                  {l.qty} x {money(r2(l.price - lineUnitDiscount(l)))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-6 w-6"
                  aria-label={`Reduce ${l.name}`}
                  onClick={() => onQty(i, -1)}
                >
                  -
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-6 w-6"
                  aria-label={`Add one ${l.name}`}
                  onClick={() => onQty(i, 1)}
                >
                  +
                </Button>
              </div>
              <div className="numeric w-20 text-right font-medium">
                {money(r2((l.price - lineUnitDiscount(l)) * l.qty))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
