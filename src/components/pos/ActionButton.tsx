import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ButtonProps = ComponentProps<typeof Button>;

export type ActionButtonProps = Omit<ButtonProps, "children"> & {
  /** Visible label — collapses to an icon-only button on narrow screens. */
  label: string;
  icon?: ReactNode;
  /** "stack" = icon above label (grid tiles), "inline" = icon beside label. */
  layout?: "stack" | "inline";
  /** Explains why the control is unavailable, shown in place of the label. */
  disabledReason?: string;
  /** Forces an icon-only control (dense table rows); label stays in the tooltip. */
  compact?: boolean;
};

/**
 * Space-aware action button: measures the space it actually sits in (container
 * query, not the viewport) and shows icon + label when there is room, else an
 * icon-only control with a tooltip. Labels wrap to two lines before clipping.
 */
export function ActionButton({
  label,
  icon,
  layout = "stack",
  className,
  disabledReason,
  compact = false,
  ...props
}: ActionButtonProps) {
  // Touch devices have no hover — a long press (450ms) reveals the label.
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
  };
  const startHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHeld(true), 450);
  };
  const tip = props.disabled && disabledReason ? `${label} — ${disabledReason}` : label;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip {...(held ? { open: true } : {})} onOpenChange={(o) => !o && cancelHold()}>
        <TooltipTrigger asChild>
          <div className="@container min-w-0">
            <Button
              aria-label={label}
              title={tip}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              onTouchCancel={cancelHold}
              onTouchMove={cancelHold}
              className={cn(
                "h-auto min-h-10 w-full min-w-0 px-2 py-2",
                layout === "stack"
                  ? "flex-col gap-1 text-xs"
                  : "justify-center gap-2 @[8rem]:justify-start",
                compact && "justify-center",
                className,
              )}
              {...props}
            >
              <span className="shrink-0" aria-hidden="true">
                {icon}
              </span>
              {!compact && (
                <span
                className={cn(
                  "hidden min-w-0 leading-tight break-words",
                  layout === "stack"
                    ? "@[4.5rem]:line-clamp-2 @[4.5rem]:block"
                    : "@[8rem]:line-clamp-2 @[8rem]:block",
                )}
                >
                  {label}
                </span>
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
