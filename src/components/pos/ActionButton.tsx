import type { ComponentProps, ReactNode } from "react";
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
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            title={label}
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
        <TooltipContent side="top" className="sm:hidden">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
