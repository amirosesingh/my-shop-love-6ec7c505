/**
 * Slide-over host for the quick settings cards. The card content is the same
 * component the full page renders, so nothing is duplicated and the deep link
 * still works for anyone who wants a whole window.
 */
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QUICK_CARDS, type QuickCardId } from "@/components/pos/settings/quick-cards";

type Props = {
  openId: QuickCardId | null;
  onClose: () => void;
};

export function SettingsDrawer({ openId, onClose }: Props) {
  const card = QUICK_CARDS.find((c) => c.id === openId) ?? null;
  const Panel = card?.panel;

  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="pt-safe pb-safe flex w-full flex-col gap-0 p-0 sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="truncate text-base">{card?.label ?? ""}</SheetTitle>
          <SheetDescription className="text-xs">{card?.blurb ?? ""}</SheetDescription>
          {card ? (
            <Link
              to={card.deepLink as never}
              className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" /> Open as a full page
            </Link>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {Panel ? <Panel /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
