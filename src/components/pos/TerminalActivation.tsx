/**
 * Full-screen activation gate for the Windows till, plus the lock screen the
 * kill-switch drops in when management revokes the machine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, ScanLine, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import qrcode from "qrcode-generator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activateTerminal,
  ActivationError,
  activateWithTokenId,
  encodePairingRequest,
  getPairingRequest,
  type TerminalConfig,
} from "@/lib/terminal-tokens";
import { clearRevocation } from "@/lib/use-revocation-check";
import { useBranding } from "@/lib/branding";

const qrDataUrl = (value: string) => {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr.createDataURL(4, 8);
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_0_60px_-15px_rgba(56,189,248,0.45)]">
        {children}
      </div>
    </div>
  );
}

export function TerminalActivation({ onActivated }: { onActivated: (c: TerminalConfig) => void }) {
  const branding = useBranding();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const pairing = useMemo(() => getPairingRequest(), []);
  const pairQr = useMemo(() => qrDataUrl(encodePairingRequest(pairing)), [pairing]);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return setError("Paste or scan the activation code first.");
      setBusy(true);
      setError("");
      try {
        const config = await activateTerminal(trimmed);
        clearRevocation();
        onActivated(config);
      } catch (e) {
        setError(
          e instanceof ActivationError ? e.message : "Activation failed. Try again in a moment.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onActivated],
  );

  // Camera scanning is optional — the paste box always works.
  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("terminal-qr-reader");
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (text) => {
            if (stopped) return;
            stopped = true;
            void scanner.stop().then(() => {
              setScanning(false);
              void submit(text);
            });
          },
          () => {},
        );
      } catch {
        setScanning(false);
        setError("No camera available — paste the activation code instead.");
      }
    })();
    return () => {
      stopped = true;
      void scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [scanning, submit]);

  // While the operator waits, keep asking whether an administrator approved
  // the pairing request from their phone. Approval activates the till itself.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const config = await activateWithTokenId(pairing.tokenId);
        if (config && !stopped) {
          clearRevocation();
          onActivated(config);
        }
      } catch (e) {
        if (!stopped && e instanceof ActivationError) setError(e.message);
      }
    };
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pairing.tokenId, onActivated]);

  return (
    <Frame>
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/40">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Activate this terminal</h1>
          <p className="text-xs text-slate-400">
            {branding.company} · {branding.terminal}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Ask your administrator for an activation code for this counter. Scan the QR code or paste
        the text block below.
      </p>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Smartphone className="size-4 text-sky-400" /> Pair with the phone app
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Scan this code from Settings → Terminal activation on the Android app and approve it. This
          till registers itself — nothing to type or copy.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <img
            src={pairQr}
            alt="Pairing code for this terminal"
            className="size-32 rounded-lg bg-white p-1"
          />
          <div className="text-[11px] text-slate-500">
            <p className="font-mono break-all text-slate-400">{pairing.tokenId.slice(0, 8)}…</p>
            <p className="mt-2 flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Waiting for approval…
            </p>
          </div>
        </div>
      </div>

      {scanning ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
          <div id="terminal-qr-reader" className="w-full" />
          <Button
            variant="ghost"
            className="w-full rounded-none text-slate-300"
            onClick={() => setScanning(false)}
          >
            Cancel scanning
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="mt-4 w-full border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800"
          onClick={() => setScanning(true)}
        >
          <Camera className="size-4" /> Scan QR code with the camera
        </Button>
      )}

      <div className="mt-4 space-y-2">
        <Label htmlFor="activation-code" className="text-xs text-slate-400">
          Activation code
        </Label>
        <Textarea
          id="activation-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="Paste the activation code here"
          className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-100"
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        className="mt-4 h-11 w-full bg-sky-500 text-slate-950 hover:bg-sky-400"
        disabled={busy}
        onClick={() => void submit(code)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        Activate terminal
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ScanLine className="size-3.5" /> The code links this machine to one location.
      </p>
    </Frame>
  );
}

/** Shown the moment the heartbeat confirms the token was revoked. */
export function TerminalRevokedScreen({ onReactivate }: { onReactivate: () => void }) {
  return (
    <Frame>
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/40">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-red-300">
          This device&apos;s authorization has been revoked by the master administrator.
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Cloud sync is blocked and the register is locked. Contact head office for a new activation
          code.
        </p>
        <Button
          variant="outline"
          className="mt-5 w-full border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800"
          onClick={onReactivate}
        >
          Enter a new activation code
        </Button>
      </div>
    </Frame>
  );
}
