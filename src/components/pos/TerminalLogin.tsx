import { useState } from "react";
import { Delete, Loader2, Lock, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { LoginScreen } from "@/components/pos/LoginScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function TerminalLogin() {
  const { pinLogin } = useAuth();
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState(false);

  if (emailMode) {
    return (
      <div className="relative">
        <LoginScreen />
        <Button
          variant="ghost"
          className="absolute inset-x-0 bottom-6 mx-auto w-fit text-xs"
          onClick={() => setEmailMode(false)}
        >
          Back to terminal PIN login
        </Button>
      </div>
    );
  }

  const submit = async (value = pin) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await pinLogin(userId, value);
    if (!res.ok) {
      setError(res.error ?? "Invalid User ID or PIN");
      setPin("");
    }
    setBusy(false);
  };

  const press = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) void submit(next);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Northwind POS</p>
            <p className="text-xs text-muted-foreground">Terminal sign in</p>
          </div>
          <Lock className="ml-auto size-4 text-muted-foreground" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="userId">User ID</Label>
          <Input
            id="userId"
            autoFocus
            autoComplete="off"
            inputMode="text"
            placeholder="EMP-101"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setError("");
            }}
            className="h-11 text-center text-base tracking-wide"
          />
        </div>

        <div className="space-y-2">
          <Label>PIN</Label>
          <div
            className="flex items-center justify-center gap-3 rounded-md border border-border bg-surface-2 py-3"
            aria-label="PIN entry"
            role="status"
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "size-3.5 rounded-full border border-border",
                  i < pin.length ? "bg-primary" : "bg-transparent",
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <Button
              key={k}
              type="button"
              variant="outline"
              className="h-14 text-lg"
              disabled={busy}
              onClick={() => press(k)}
            >
              {k}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="h-14 text-xs"
            disabled={busy}
            onClick={() => {
              setPin("");
              setError("");
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 text-lg"
            disabled={busy}
            onClick={() => press("0")}
          >
            0
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-14"
            aria-label="Delete last digit"
            disabled={busy}
            onClick={() => setPin(pin.slice(0, -1))}
          >
            <Delete className="size-5" />
          </Button>
        </div>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <Button className="w-full" disabled={busy || pin.length !== 4} onClick={() => void submit()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => setEmailMode(true)}
        >
          Admin? Sign in with email instead
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          PINs are verified against a hashed record in the backend — they are never stored on this
          terminal.
        </p>
      </div>
    </div>
  );
}
