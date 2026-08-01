import { useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            if (mode === "signin") {
              const res = await login(email, password);
              if (!res.ok) setError(res.error ?? "Sign in failed");
            } else {
              const res = await signUp(email, password, fullName);
              if (!res.ok) setError(res.error ?? "Sign up failed");
              else if (res.needsConfirmation)
                setNotice("Check your email to confirm the account, then sign in.");
            }
          } finally {
            setBusy(false);
          }
        }}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Northwind POS</p>
            <p className="text-xs text-muted-foreground">
              {mode === "signin" ? "Staff sign in" : "Create a staff account"}
            </p>
          </div>
        </div>

        {mode === "signup" && (
          <div className="space-y-1">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="cashier@store.com"
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
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-success">{notice}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
        >
          {mode === "signin" ? "New here? Create a staff account" : "Already have an account? Sign in"}
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Accounts sign in against the live backend. Access to sales, inventory and reports is
          granted by an admin from the User Roles screen.
        </p>
      </form>
    </div>
  );
}
