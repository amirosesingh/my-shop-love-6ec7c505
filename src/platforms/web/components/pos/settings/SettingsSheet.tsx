/**
 * The half window every settings card opens into.
 *
 * Docked to the bottom so the card grid stays visible behind it: a setting can
 * be checked and closed without ever leaving the page you were on. The same
 * components back the full page, so nothing is duplicated and the deep link
 * still works for anyone who wants a whole window.
 */
import { Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronsDownUp, ChevronsUpDown, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmbeddedSettings } from "@/platforms/web/components/pos/settings/embed";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import type { SettingsCard } from "@/lib/settings-catalog";

type Props = {
  card: SettingsCard | null;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  onClose: () => void;
};

export function SettingsSheet({ card, expanded, onExpandedChange, onClose }: Props) {
  const Panel = card?.panel;

  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className={`pb-safe flex flex-col gap-0 p-0 transition-[height] duration-200 ${
          expanded ? "h-[92vh]" : "h-[58vh]"
        }`}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{card?.label ?? ""}</SheetTitle>
              <SheetDescription className="text-xs">{card?.blurb ?? ""}</SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() => onExpandedChange(!expanded)}
              aria-label={expanded ? "Shrink to half window" : "Expand to full window"}
            >
              {expanded ? (
                <ChevronsDownUp className="size-4" />
              ) : (
                <ChevronsUpDown className="size-4" />
              )}
              {expanded ? "Half" : "Expand"}
            </Button>
          </div>
          {card ? (
            <Link
              to={card.to as never}
              className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" /> Open as a full page
            </Link>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <EmbeddedSettings>
            <Suspense
              fallback={
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              }
            >
              {Panel ? (
                card?.raw ? (
                  <SettingsFrame wide title={card.label} description={card.blurb}>
                    <Panel />
                  </SettingsFrame>
                ) : (
                  <Panel />
                )
              ) : null}
            </Suspense>
          </EmbeddedSettings>
        </div>
      </SheetContent>
    </Sheet>
  );
}
