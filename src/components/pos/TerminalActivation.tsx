/**
 * Full-screen activation gate for the Windows till, plus the lock screen the
 * kill-switch drops in when management revokes the machine.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  ClipboardPaste,
  KeyRound,
  Loader2,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import qrcode from "qrcode-generator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activateTerminal,
  ActivationError,
  activateWithTokenId,
  encodePairingRequest,
  getPairingRequest,
  type TerminalConfig,
} from "@/lib/terminal-tokens";
import { clearRevocation } from "@/lib/use-revocation-check";
import { writeActivationRecord } from "@/lib/activation-record";
import { isCloudConnected } from "@/lib/registration-status";
import { subscribeConnectivity } from "@/lib/connection-health";
import { CameraScanner } from "@/components/pos/CameraScanner";
import { useBranding } from "@/lib/branding";

const qrDataUrl = (value: string) => {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr.createDataURL(4, 8);
};

function Frame({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  // "bare" drops the full-screen shell so the same activation form can sit
  // inside the Emergency Access hub as one card among several.
  if (bare) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4 text-slate-100">
        {children}
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_0_60px_-15px_rgba(56,189,248,0.45)]">
        {children}
      </div>
    </div>
  );
}

export function TerminalActivation({
  onActivated,
  embedded = false,
}: {
  onActivated: (c: TerminalConfig) => void;
  /** Render as a plain card (Emergency Access hub) instead of a full screen. */
  embedded?: boolean;
}) {
  // Pairing is a cloud round-trip: offline it must stay quiet instead of
  // reporting a verification failure every three seconds.
  const [online, setOnline] = useState(() => isCloudConnected());
  useEffect(() => subscribeConnectivity(() => setOnline(isCloudConnected())), []);
  const branding = useBranding();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  // Minted after mount: the id is random, so generating it during SSR would
  // hydrate a different QR than the server drew and blow up the page.
  const [pairing, setPairing] = useState<ReturnType<typeof getPairingRequest> | null>(null);
  useEffect(() => setPairing(getPairingRequest()), []);
  const pairQr = useMemo(
    () => (pairing ? qrDataUrl(encodePairingRequest(pairing)) : ""),
    [pairing],
  );

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return setError("Paste or scan the activation code first.");
      setBusy(true);
      setError("");
      try {
        const config = await activateTerminal(trimmed);
        clearRevocation();
        await writeActivationRecord({ tokenId: config.tokenId }).catch(() => {});
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

  // While the operator waits, keep asking whether an administrator approved
  // the pairing request from their phone. Approval activates the till itself.
  useEffect(() => {
    if (!pairing || !online) return;
    let stopped = false;
    const tick = async () => {
      try {
        const config = await activateWithTokenId(pairing.tokenId);
        if (config && !stopped) {
          clearRevocation();
          await writeActivationRecord({ tokenId: config.tokenId }).catch(() => {});
          onActivated(config);
        }
      } catch (e) {
        if (!stopped && e instanceof ActivationError) setError(e.message);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pairing, onActivated, online]);

  return (
    <Frame bare={embedded}>
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

      <Tabs defaultValue="scan" className="mt-4">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800/60">
          <TabsTrigger value="scan">
            <Camera className="size-4" /> Scan QR
          </TabsTrigger>
          <TabsTrigger value="manual">
            <KeyRound className="size-4" /> Enter token
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scan" className="mt-4">
          {scanning ? (
            <div className="space-y-2">
              <CameraScanner
                onScan={(text) => {
                  setScanning(false);
                  void submit(text);
                }}
                onClose={() => setScanning(false)}
              />
              <Button
                variant="ghost"
                className="w-full text-slate-300"
                onClick={() => setScanning(false)}
              >
                Cancel scanning
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800"
              onClick={() => setScanning(true)}
            >
              <Camera className="size-4" /> Scan the activation QR code
            </Button>
          )}
        </TabsContent>

        <TabsContent value="manual" className="mt-4 space-y-2">
          <Label htmlFor="activation-code" className="text-xs text-slate-400">
            One-time activation token
          </Label>
          <Textarea
            id="activation-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="ENC_V1:…"
            className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-100"
          />
          <Button
            variant="ghost"
            className="w-full text-slate-300"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text.trim()) setCode(text.trim());
              } catch {
                setError("Could not read the clipboard. Paste the token by hand.");
              }
            }}
          >
            <ClipboardPaste className="size-4" /> Paste from clipboard
          </Button>
        </TabsContent>
      </Tabs>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50">
        <button
          type="button"
          onClick={() => setShowPairing((v) => !v)}
          className="flex w-full items-center justify-between p-3 text-sm font-medium text-slate-200"
        >
          <span className="flex items-center gap-2">
            <Smartphone className="size-4 text-sky-400" /> Pair from the phone app
          </span>
          <ChevronDown className={`size-4 transition ${showPairing ? "rotate-180" : ""}`} />
        </button>
        {showPairing && (
          <div className="border-t border-slate-800 p-3">
            <p className="text-xs text-slate-400">
              Scan this code from Settings → Terminal activation on the Android app and approve it.
              This till registers itself — nothing to type or copy.
            </p>
            <div className="mt-3 flex items-center gap-3">
              {pairQr ? (
                <img
                  src={pairQr}
                  alt="Pairing code for this terminal"
                  className="size-32 rounded-lg bg-white p-1"
                />
              ) : (
                <div className="grid size-32 place-items-center rounded-lg border border-slate-700 bg-slate-900">
                  <Loader2 className="size-5 animate-spin text-slate-500" />
                </div>
              )}
              <div className="text-[11px] text-slate-500">
                <p className="font-mono break-all text-slate-400">
                  {pairing ? `${pairing.tokenId.slice(0, 8)}…` : "Preparing…"}
                </p>
                <p className="mt-2 flex items-center gap-1">
                  {online ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Waiting for approval…
                    </>
                  ) : (
                    <>Waiting for a connection…</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {!online && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400">
          No connection to the central database right now. Activation needs one — this screen will
          pick up automatically as soon as the link is back.
        </div>
      )}

      {error && online && (
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
