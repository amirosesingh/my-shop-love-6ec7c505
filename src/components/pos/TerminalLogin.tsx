import { useState } from "react";
import { Delete, Loader2, Lock, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function TerminalLogin() {
  const { login, cashierLogin } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const submitPin = async (value = pin) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await cashierLogin(username, value);
    if (!res.ok) {
      setError(res.error ?? "Invalid username or PIN");
      setPin("");
    }
    setBusy(false);
  };

  const press = (digit: string) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 6) void submitPin(next);
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

        <Tabs
          defaultValue="cashier"
          onValueChange={() => {
            setError("");
            setPin("");
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cashier">Cashier PIN</TabsTrigger>
            <TabsTrigger value="admin">Supervisor / Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="cashier" className="space-y-5 pt-4">
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                placeholder="cashier101"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/\s+/g, ""));
                  setError("");
                }}
                className="h-11 text-center text-base tracking-wide"
              />
            </div>

            <div className="space-y-2">
              <Label>6-digit PIN</Label>
              <div
                className="flex items-center justify-center gap-3 rounded-md border border-border bg-surface-2 py-3"
                aria-label="PIN entry"
                role="status"
              >
                {[0, 1, 2, 3, 4, 5].map((i) => (
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

            <Button
              className="w-full"
              disabled={busy || pin.length !== 6}
              onClick={() => void submitPin()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              PINs are verified by the backend — they are never stored on this terminal.
            </p>
          </TabsContent>

          <TabsContent value="admin" className="pt-4">
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const res = await login(email, password);
                if (!res.ok) setError(res.error ?? "Sign in failed");
                setBusy(false);
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="supervisor@store.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Supervisor and admin accounts sign in with email and password; cashiers use the
                PIN tab.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
