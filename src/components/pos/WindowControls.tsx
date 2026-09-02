import { useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isTicketDirty, useWindowControls } from "@/platforms/windows/desktop-window";

const btn =
  "app-no-drag inline-flex h-[34px] w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Minimise / maximise / close drawn inside the frameless desktop window. */
export function WindowControls() {
  const { supported, maximized, minimize, toggleMaximize, close } = useWindowControls();
  const [confirm, setConfirm] = useState(false);
  if (!supported) return null;

  return (
    <>
      <div className="ml-auto flex shrink-0 items-stretch">
        <button type="button" className={btn} aria-label="Minimise window" onClick={minimize}>
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label={maximized ? "Restore window" : "Maximise window"}
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
        </button>
        <button
          type="button"
          className={`${btn} hover:bg-destructive hover:text-destructive-foreground`}
          aria-label="Close window"
          onClick={() => (isTicketDirty() ? setConfirm(true) : close())}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close with an open ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              There are items on the current ticket. Closing the till now discards them — hold the
              order first if you want to come back to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Close anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}