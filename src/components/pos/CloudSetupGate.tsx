/**
 * One-time, never-blocking setup prompt shown on terminal apps (Windows till,
 * Android APK) when no central cloud keys are configured on this device yet.
 *
 * "Continue Offline" dismisses it and the device trades 100% locally —
 * cashier sign-in, scanning, checkout and printing are all unaffected.
 * "Open Settings" jumps straight to Database & Cloud Connection. The prompt
 * reappears on the next launch until keys are saved.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CloudOff, LifeBuoy, Settings } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isTerminalApp } from "@/platforms/mobile/native";
import { cloudKeyStatus, subscribeCloudKeys } from "@/lib/secure-cloud-config";
import { isCloudConnected } from "@/core/activation/registration-status";

export function CloudSetupGate() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTerminalApp()) return;

    const check = async () => {
      try {
        const status = await cloudKeyStatus();
        // Prompting for cloud keys with no connection is misleading: the
        // device cannot verify them anyway, and it trades locally regardless.
        if (!status.configured && isCloudConnected()) setOpen(true);
      } catch {
        /* a storage hiccup must never block the till from opening */
      }
    };
    void check();

    // The desktop shell announces the missing keys as soon as the window shows.
    const offShell = window.pos?.onCloudSetupRequired?.(() => {
      if (isCloudConnected()) setOpen(true);
    });
    // Saving keys anywhere in the app closes the prompt immediately.
    const offKeys = subscribeCloudKeys(() => {
      void cloudKeyStatus()
        .then((status) => {
          if (status.configured) setOpen(false);
        })
        .catch(() => {});
    });
    return () => {
      offShell?.();
      offKeys();
    };
  }, []);

  if (!isTerminalApp()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudOff className="size-5 text-warning" />
            Cloud Sync Setup Required
          </DialogTitle>
          <DialogDescription>
            Please configure your Online Database Keys in Settings to enable automatic
            synchronization. Until then this device trades fully offline — sign-in, scanning,
            checkout and receipt printing all work as normal, and every sale is kept safely on
            this device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Continue Offline
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/recovery" });
            }}
          >
            <LifeBuoy className="size-4" />
            Emergency access
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/settings/system" });
            }}
          >
            <Settings className="size-4" />
            Open Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
