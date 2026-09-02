/**
 * PIN gate in front of Emergency Access.
 *
 * Recovery Settings never open straight away: the operator has to type the
 * one-minute recovery code first. Verification happens entirely on this
 * device — no internet, no cloud, no database, nobody signed in — and the
 * unlock lasts for this screen only, never persisted.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Delete, LifeBuoy, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isTerminalApp } from "@/platform-config/platform";
import {
  emergencyFingerprint,
  emergencyPinAvailable,
  verifyEmergencyPin,
} from "@/lib/emergency-pin";
import { lockoutRemaining, notePinFailure, attemptsLeft, clearPinFailures } from "@/lib/pin-lockout";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function EmergencyPinGate({ children }: { children: ReactNode }) {
  const gated = isTerminalApp();
  const [unlocked, setUnlocked] = useState(!gated);
  const [available, setAvailable] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const [locked, setLocked] = useState(0);

  useEffect(() => {
    if (!gated) return;
    void emergencyPinAvailable().then(setAvailable).catch(() => setAvailable(false));
    void emergencyFingerprint().then(setFingerprint).catch(() => {});
  }, [gated]);

  useEffect(() => {
    if (!gated || unlocked) return;
    const tick = () => setLocked(lockoutRemaining());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [gated, unlocked]);

  if (unlocked) return <>{children}</>;

  const submit = async (code: string) => {
    if (busy || locked > 0) return;
    setBusy(true);
    setError("");
    const ok = await verifyEmergencyPin(code);
    setBusy(false);
    setPin("");
    if (ok) {
      clearPinFailures();
      setUnlocked(true);
      return;
    }
    const wait = notePinFailure();
    setLocked(wait);
    setError(
      wait > 0
        ? "Too many attempts. Try again in a few minutes."
        : `Incorrect code. ${attemptsLeft()} attempt(s) left.`,
    );
  };

  const press = (key: string) => {
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!key) return;
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      <div className="flex items-center gap-2 text-foreground">
        <LifeBuoy className="size-5 text-warning" />
        <h1 className="text-lg font-semibold">Emergency access</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit recovery code for this terminal to open the connection settings.
      </p>

      {!available ? (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          Recovery codes are not available on this device.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3" aria-label="PIN entry">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`size-3 rounded-full ${i < pin.length ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            {KEYS.map((key, i) => (
              <Button
                key={`${key}-${i}`}
                variant={key === "back" ? "outline" : "secondary"}
                disabled={!key || busy || locked > 0}
                className={key ? "h-14 text-lg" : "pointer-events-none h-14 opacity-0"}
                onClick={() => press(key)}
              >
                {key === "back" ? <Delete className="size-5" /> : key}
              </Button>
            ))}
          </div>

          {locked > 0 && (
            <p className="text-sm text-destructive">
              Locked for {Math.ceil(locked / 1000)}s
            </p>
          )}
          {error && locked === 0 && <p className="text-sm text-destructive">{error}</p>}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Terminal {fingerprint || "—"} · the code changes every minute
          </p>
        </>
      )}
    </main>
  );
}
