/**
 * Terminal sign-in for anyone who uses a PIN.
 *
 * Two steps: pick your name from the people who work at this branch, then
 * tap your PIN on the keypad. Sign-in fires as soon as the last digit lands.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Delete, Loader2, ShieldAlert, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/pos-auth";
import { activeBranchId } from "@/lib/active-branch";
import { listTerminalStaff, type TerminalStaff } from "@/lib/staff-admin";
import {
  attemptsLeft,
  clearPinFailures,
  describeLockout,
  lockoutRemaining,
  notePinFailure,
} from "@/lib/pin-lockout";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function CashierPinLogin({ onAdminLogin }: { onAdminLogin?: () => void }) {
  const { cashierLogin } = useAuth();
  const [staff, setStaff] = useState<TerminalStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<TerminalStaff | null>(null);
  const [manual, setManual] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedFor, setLockedFor] = useState(() => lockoutRemaining());
  const pinRef = useRef(pin);
  pinRef.current = pin;

  // Countdown while the keypad is locked after too many wrong PINs.
  useEffect(() => {
    if (!lockedFor) return;
    const t = window.setInterval(() => setLockedFor(lockoutRemaining()), 1000);
    return () => window.clearInterval(t);
  }, [lockedFor]);

  useEffect(() => {
    let live = true;
    void listTerminalStaff(activeBranchId(null))
      .then((rows) => live && setStaff(rows))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const username = picked?.username ?? manual.trim().toLowerCase();
  const pinLength = picked?.pinLength && picked.pinLength >= 4 ? picked.pinLength : 4;

  const submit = useCallback(
    async (value: string) => {
      if (!username) {
        setError("Choose who is signing in");
        return;
      }
      const waiting = lockoutRemaining();
      if (waiting) {
        setLockedFor(waiting);
        setPin("");
        return;
      }
      setBusy(true);
      setError("");
      const res = await cashierLogin(username, value);
      if (!res.ok) {
        const message = res.error ?? "That PIN was not recognised";
        const deactivated = /deactivat|not active|blocked/i.test(message);
        setPin("");
        if (deactivated) {
          setError("Account deactivated. Please contact an administrator.");
        } else {
          const locked = notePinFailure();
          setLockedFor(locked);
          const left = attemptsLeft();
          setError(
            locked
              ? ""
              : `${message}${left ? ` — ${left} attempt${left === 1 ? "" : "s"} left` : ""}`,
          );
        }
      } else {
        clearPinFailures();
      }
      setBusy(false);
    },
    [cashierLogin, username],
  );

  const press = (digit: string) => {
    if (busy || lockedFor || pinRef.current.length >= pinLength) return;
    const next = pinRef.current + digit;
    setPin(next);
    setError("");
    if (next.length === pinLength) void submit(next);
  };

  // Physical keyboards and keypads work exactly like the on-screen pad.
  useEffect(() => {
    if (!picked && !manual) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.tagName === "INPUT" && el.id === "pin-username") return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin(pinRef.current.slice(0, -1));
      } else if (e.key === "Enter" && pinRef.current.length >= 4) {
        e.preventDefault();
        void submit(pinRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, manual, busy, pinLength, submit]);

  /* ---------------------------- step one: person --------------------------- */
  if (!picked && !manual) {
    return (
      <div className="space-y-4 pt-4">
        <div>
          <p className="text-sm font-medium">Who is signing in?</p>
          <p className="text-[11px] text-muted-foreground">
            Tap your name to continue to the keypad.
          </p>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : staff.length ? (
          <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto">
            {staff.map((s) => (
              <button
                key={s.username}
                type="button"
                onClick={() => {
                  setPicked(s);
                  setPin("");
                  setError("");
                }}
                className="flex flex-col items-start gap-1 rounded-md border border-border bg-surface-2 p-3 text-left transition-colors hover:bg-accent"
              >
                <UserRound className="size-4 text-muted-foreground" />
                <span className="w-full truncate text-sm font-medium">
                  {s.fullName || s.username}
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {s.roleSlug.replace(/-/g, " ")}
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
            No staff are listed for this terminal&apos;s branch yet. Type your username below.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="pin-username">Or enter a username</Label>
          <Input
            id="pin-username"
            autoComplete="username"
            placeholder="cashier101"
            onChange={(e) => setManual(e.target.value.replace(/\s+/g, ""))}
            className="h-11 text-center"
          />
        </div>
      </div>
    );
  }

  /* ------------------------------ step two: PIN ---------------------------- */
  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{picked?.fullName || username}</p>
          <p className="truncate text-[11px] text-muted-foreground">{username}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={() => {
            setPicked(null);
            setManual("");
            setPin("");
            setError("");
          }}
        >
          <ArrowLeft className="size-4" /> Change
        </Button>
      </div>

      <div
        className="flex items-center justify-center gap-3 rounded-md border border-border bg-surface-2 py-3"
        aria-label="PIN entry"
        role="status"
      >
        {Array.from({ length: pinLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border border-border",
              i < pin.length ? "bg-primary" : "bg-transparent",
            )}
          />
        ))}
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

      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Signing in…
        </p>
      )}
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        PINs are checked by the backend. Once you have signed in here, the same PIN works with
        no connection.
      </p>
    </div>
  );
}