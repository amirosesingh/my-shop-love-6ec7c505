import { useState } from "react";
import { Loader2, Lock, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TerminalLogin() {
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
                  autoFocus
                  autoComplete="email"
                  placeholder="you@store.com"
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
                Cashiers, supervisors and admins all sign in with their email and password.
                Permissions are applied automatically from the staff profile.
              </p>
        </form>
      </div>
    </div>
  );
}
