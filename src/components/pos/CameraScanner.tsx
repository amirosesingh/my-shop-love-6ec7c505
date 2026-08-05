/**
 * Small camera QR reader used by the terminal pairing flow.
 * Renders nothing but the live preview; the caller decides what a scan means.
 */
import { useEffect, useId, useRef } from "react";
import { Loader2 } from "lucide-react";

export function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose?: () => void;
}) {
  const domId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const handled = useRef(false);

  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null;
    let stopped = false;
    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode(domId);
        scanner = instance as unknown as { stop: () => Promise<void> };
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          (text) => {
            if (stopped || handled.current) return;
            handled.current = true;
            void instance.stop().then(() => onScan(text));
          },
          () => {},
        );
      } catch {
        onClose?.();
      }
    })();
    return () => {
      stopped = true;
      void scanner?.stop().catch(() => {});
    };
  }, [domId, onScan, onClose]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black/80">
      <div id={domId} className="w-full" />
      <p className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Looking for a code…
      </p>
    </div>
  );
}
