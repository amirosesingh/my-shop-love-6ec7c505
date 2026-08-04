import { useState, type ReactNode } from "react";
import { Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { money, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shiftDuration } from "@/lib/shift-hours";

/**
 * Hard terminal lock.
 *
 * The register is only usable while the database holds an OPEN shift for the
 * current branch. A shift opened on any earlier day still counts — nothing
 * here looks at the calendar.
 *
 * With no open shift the whole shell stays on screen exactly as it looks when
 * trading, but dimmed, blurred and completely inert: no click, no keyboard
 * focus, no scanner wedge input reaches it. An un-dismissable panel floats on
 * top with the opening float form and a way to hand the terminal back.
 *
 * Staff holding `can_bypass_shift_lock` (admins and supervisors by default)
 * are never locked.
 */
export function ShiftGuard({ children }: { children: ReactNode }) {
  const { activeShift, openShift, currentStore } = usePos();
  const { user, lock, can } = useAuth();
  const [cashier, setCashier] = useState(user?.name ?? "Cashier");
  const [float, setFloat] = useState("150");

  const bypass = can("can_bypass_shift_lock");
  const mayOpen = can("can_open_shift");

  if (activeShift) {
    const opened = new Date(activeShift.openedAt);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-success/30 bg-success/10 px-4 py-1.5 text-[11px] text-success">
          <span className="font-semibold">Shift open · {activeShift.cashier}</span>
          <span>
            Opened {opened.toLocaleDateString()} at {opened.toLocaleTimeString()}
          </span>
          <span>Float {money(activeShift.openingFloat)}</span>
          <span>Running {shiftDuration(activeShift)}</span>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  if (bypass) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-[11px] text-warning-foreground">
          <Lock className="size-3" />
          <span className="font-semibold">No shift open at {currentStore.name}</span>
          <span>Your account can use the terminal without one.</span>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* The real UI stays visible so the terminal looks normal — but frozen. */}
      <div
        // `inert` keeps keyboard, focus and scanner-wedge input out of the tree.
        {...({ inert: true } as unknown as Record<string, boolean>)}
        aria-hidden
        className="pointer-events-none flex min-h-0 flex-1 select-none opacity-40 blur-[1px] saturate-50"
      >
        {children}
      </div>

      <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 p-6 backdrop-blur-[2px]">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Terminal locked</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No shift is open for {currentStore.name}.{" "}
            {mayOpen
              ? "Enter the opening cash float to start trading on this terminal."
              : "Ask a supervisor to open the shift, or sign in with an account that can."}
          </p>

          {mayOpen && (
            <div className="mt-5 space-y-3 text-left">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cashier</Label>
                <Input value={cashier} onChange={(e) => setCashier(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Opening float</Label>
                <Input
                  className="numeric"
                  inputMode="decimal"
                  value={float}
                  onChange={(e) => setFloat(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const amount = Number(float);
                  if (!Number.isFinite(amount) || amount < 0) {
                    toast.error("Enter a valid opening float");
                    return;
                  }
                  openShift(cashier.trim() || "Cashier", amount);
                  toast.success("Shift opened");
                }}
              >
                Open shift
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => void lock()}
          >
            <LogOut className="size-3.5" /> Lock / switch user
          </Button>
        </div>
      </div>
    </div>
  );
}