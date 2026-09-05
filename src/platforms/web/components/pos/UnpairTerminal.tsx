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
import { isTerminalApp } from "@/platform-config/platform";
import {
  readTerminalConfig,
  revokeTerminalToken,
  unpairTerminal,
} from "@/core/activation/terminal-tokens";
import { useManagerGate } from "@/lib/manager-gate";
import { useAuthOptional } from "@/lib/pos-auth";

export function UnpairTerminalCard() {
  const [confirming, setConfirming] = useState(false);
  const { authorize } = useManagerGate();
  const auth = useAuthOptional();
  const config = readTerminalConfig();

  if (!isTerminalApp()) return null;

  /**
   * One authorisation path: administrators go straight through (the approval
   * is recorded server-side), everyone else meets the manager PIN dialog when
   * the branch rules ask for it.
   */
  const ask = async () => {
    const res = await authorize({
      action: "terminal_unpair",
      title: "Unpair this terminal",
      reason: "Removing the saved activation from this machine",
      ...(config?.locationId ? { storeId: config.locationId } : {}),
      ...(config?.tokenId ? { terminalId: config.tokenId } : {}),
      ...(auth?.user?.staffId ? { requestedBy: auth.user.staffId } : {}),
    });
    if (res.ok) setConfirming(true);
  };

  const run = async () => {
    // Retire the registration centrally first, so the credentials this machine
    // held are refused even if someone restores an old copy of them. Trading
    // history — sales, shifts, payments, transfers, audit — is never touched.
    if (config?.tokenId) {
      try {
        await revokeTerminalToken(config.tokenId);
      } catch {
        toast.message("Cleared on this device; the register will catch up when it reconnects.");
      }
    }
    await unpairTerminal();
    toast.success("Terminal cleared — enter a new activation code");
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
      <Button size="sm" variant="destructive" onClick={() => void ask()}>
        <Unplug className="size-4" /> Unpair / reset terminal
      </Button>

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