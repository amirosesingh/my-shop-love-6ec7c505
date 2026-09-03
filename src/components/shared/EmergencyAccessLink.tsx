/**
 * The one way into Emergency Access, used by every screen a terminal can get
 * stuck on: the connection gate, the "not configured" prompt and the
 * activation screen.
 *
 * Always router navigation, never `<a href>`: a hard page load restarts the
 * shell, which puts the very gate the operator is escaping straight back in
 * front of the repair screen.
 */
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmergencyAccessLink({
  className,
  label = "Emergency access",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link
      to="/recovery"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground",
        className,
      )}
    >
      <LifeBuoy className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
