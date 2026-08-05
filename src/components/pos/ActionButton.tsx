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
};

/**
 * Space-aware action button: shows icon + label when there is room and
 * collapses to an icon-only control (with tooltip) on small screens.
 */
export function ActionButton({
  label,
  icon,
  layout = "stack",
  className,
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
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip {...(held ? { open: true } : {})} onOpenChange={(o) => !o && cancelHold()}>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            title={label}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            onTouchMove={cancelHold}
            className={cn(
              layout === "stack"
                ? "flex-col gap-1 text-xs"
                : "justify-center gap-2 sm:justify-start",
              className,
            )}
            {...props}
          >
            {icon}
            <span className={cn(layout === "stack" ? "hidden sm:inline" : "hidden sm:inline")}>
              {label}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
