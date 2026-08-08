/**
 * Manager-gated "forget this machine" control. Purging the vault sends the
 * till back to the activation screen, so it is kept behind a PIN.
 */
import { useState } from "react";
import { Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { ManagerOverrideDialog, type OverrideRequest } from "@/components/pos/ManagerOverrideDialog";
import { isTerminalApp } from "@/lib/native";
import { readTerminalConfig, unpairTerminal } from "@/lib/terminal-tokens";

const REQUEST: OverrideRequest = {
  action: "terminal_unpair",
  title: "Unpair this terminal",
  reason: "Removing the saved activation from this machine",
};

export function UnpairTerminalCard() {
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const config = readTerminalConfig();

  if (!isTerminalApp()) return null;

  const run = async () => {
    await unpairTerminal();
    toast.success("Terminal unpaired — enter a new activation code");
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <section className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2">
        <Unplug className="size-4 text-destructive" />
        <h2 className="text-sm font-semibold">Unpair / reset terminal</h2>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Removes this machine&apos;s saved activation, its connection details and its machine
        account from the secure vault. The till returns to the activation screen and needs a new
        one-time code. Requires a manager PIN.
      </p>
      {config && (
        <p className="text-[11px] text-muted-foreground">
          Currently registered to <span className="font-medium">{config.locationName || "—"}</span>{" "}
          · token {config.tokenId.slice(0, 8)}…
        </p>
      )}
      <Button size="sm" variant="destructive" onClick={() => setAsking(true)}>
        <Unplug className="size-4" /> Unpair / reset terminal
      </Button>

      <ManagerOverrideDialog
        request={asking ? REQUEST : null}
        onClose={() => setAsking(false)}
        onApproved={() => {
          setAsking(false);
          setConfirming(true);
        }}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair this terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              This machine will forget its branch, its database connection and its saved sign-in.
              Nothing can be sold on it until an administrator issues a new activation code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it paired</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run()}>Unpair terminal</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}