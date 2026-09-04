/**
 * Pin / unpin control shown on section cards and settings rows.
 *
 * It only stores an identifier. Access is unchanged: the pinned entry is
 * rebuilt from the shared navigation list and filtered by the same rules.
 */
import { Pin, PinOff } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { useNavPins, type PinKind } from "@/lib/nav-pins";
import { cn } from "@/lib/utils";

type Props = {
  kind: PinKind;
  itemKey: string;
  label: string;
  className?: string;
};

export function PinButton({ kind, itemKey, label, className }: Props) {
  const { authUserId, isAdmin } = useAuth();
  const { isPinned, toggle } = useNavPins(authUserId ?? null);
  const pinned = isPinned(kind, itemKey);

  if (!authUserId && !isAdmin) return null;

  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label} from the menu` : `Pin ${label} to the menu`}
      title={pinned ? "Remove from the pinned menu" : "Pin to the top of the menu"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, itemKey);
      }}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pinned && "text-primary",
        className,
      )}
    >
      {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      <span className="sr-only">{pinned ? "Pinned" : "Not pinned"}</span>
    </button>
  );
}
