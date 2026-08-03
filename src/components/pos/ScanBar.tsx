/**
 * Always-visible barcode entry for the register. Hardware scanners behave like
 * a keyboard, so the input stays focused and a global capture also catches
 * fast bursts typed while the cursor is elsewhere on the page. On the phone
 * build an extra button opens the camera scanner.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const isCapacitor = () =>
  typeof window !== "undefined" &&
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    ?.isNativePlatform?.());

/** True when the user is typing into a real field, so we must not steal keys. */
function typingInField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function ScanBar({
  onScan,
  disabled,
  className,
}: {
  onScan: (code: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [native, setNative] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setNative(isCapacitor()), []);

  // Keyboard-wedge capture: a burst of characters ending with Enter is a scan.
  useEffect(() => {
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e.target)) return;
      const now = Date.now();
      if (now - last > 120) buffer = "";
      last = now;
      if (e.key === "Enter") {
        const value = buffer.trim();
        buffer = "";
        if (value.length >= 3) {
          e.preventDefault();
          onScan(value);
        }
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScan]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    onScan(value);
    setCode("");
    inputRef.current?.focus();
  };

  const cameraScan = async () => {
    try {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== "granted" && perm.camera !== "limited") return;
      const { barcodes } = await BarcodeScanner.scan();
      const value = barcodes[0]?.rawValue?.trim();
      if (value) onScan(value);
    } catch {
      /* camera unavailable — the typed/scanner path still works */
    }
  };

  return (
    <form onSubmit={submit} className={className}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={code}
            autoFocus
            disabled={disabled}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Scan barcode to add to the ticket…"
            aria-label="Scan barcode"
            className="numeric h-10 pl-9"
          />
        </div>
        {native && (
          <Button type="button" variant="outline" className="h-10 shrink-0" onClick={cameraScan}>
            <Camera className="size-4" />
            <span className="hidden sm:inline">Scan</span>
          </Button>
        )}
      </div>
    </form>
  );
}
