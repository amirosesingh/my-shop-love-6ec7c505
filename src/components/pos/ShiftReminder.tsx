import { useEffect, useState } from "react";
import { AlarmClock, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePos } from "@/lib/pos-store";
import { minutesUntilDue, shiftDuration } from "@/lib/shift-hours";

/** Reminds the cashier to close a shift that is near, or past, the trading-day
 *  end. Dismissing hides it until the next reminder tick. */
export function ShiftReminder() {
  const { activeShift, state } = usePos();
  const hours = state.settings.hours;
  const [now, setNow] = useState(() => Date.now());
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!activeShift) return null;

  const left = minutesUntilDue(activeShift, hours, new Date(now));
  if (left == null || left > Math.max(0, hours.reminderMinutes)) return null;
  // Snooze for 15 minutes after a dismiss.
  if (dismissedAt && now - dismissedAt < 15 * 60_000) return null;

  const overdue = left < 0;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm ${
        overdue
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning-foreground"
      }`}
    >
      <AlarmClock className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {overdue
          ? `Shift left open — running ${shiftDuration(activeShift, new Date(now))} (${Math.abs(left)} min past closing).`
          : `Closing time in ${left} min. Remember to close the shift for ${activeShift.cashier}.`}
      </span>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link to="/shifts">Go to shifts</Link>
      </Button>
      <button
        type="button"
        aria-label="Dismiss shift reminder"
        onClick={() => setDismissedAt(Date.now())}
        className="rounded p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
