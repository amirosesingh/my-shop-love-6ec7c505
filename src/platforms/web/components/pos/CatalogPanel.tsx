import { Lock, MonitorPlay, PackageSearch, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Left column of the register: shift controls and the entry point into the
 *  Search & add product modal. The browsable product list lives in that modal
 *  now, so the column stays clean and resizable. */
export function CatalogPanel({
  storeName,
  shiftOpen,
  onOpenCatalog,
  onOpenCustomerDisplay,
  onOpenShift,
  onCloseShift,
  onRacketBooking,
  showHeaderActions = true,
}: {
  storeName: string;
  shiftOpen: boolean;
  /** opens the Search & add product modal */
  onOpenCatalog: () => void;
  onOpenCustomerDisplay?: () => void;
  onOpenShift?: () => void;
  onCloseShift?: () => void;
  /** Opens a racket / stringing job booking — independent of the cart. */
  onRacketBooking?: () => void;
  showHeaderActions?: boolean;
}) {
  return (
    <>
      {showHeaderActions && (
        <div className="flex flex-wrap items-center gap-2">
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

      <Button
        className="h-14 w-full justify-center gap-2 text-base"
        disabled={!shiftOpen}
        title={shiftOpen ? "Find an item and add it to the bill" : "Open a shift to sell"}
        onClick={onOpenCatalog}
      >
        <PackageSearch className="size-5" />
        Search &amp; add product
      </Button>

      {onRacketBooking && (
        <Button
          variant="secondary"
          className="h-11 w-full justify-center gap-2"
          disabled={!shiftOpen}
          title={
            shiftOpen
              ? "Take a racket / stringing job — no cart items needed"
              : "Open a shift to take a booking"
          }
          onClick={onRacketBooking}
        >
          <Zap className="size-4" />
          <span className="truncate">Racket booking</span>
        </Button>
      )}

      {!shiftOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Lock className="size-4" />
          <span>Selling is locked at {storeName}. Open a shift to ring up sales.</span>
        </div>
      )}
    </>
  );
}
