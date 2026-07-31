import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/pos-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const res = login(username, password);
          if (!res.ok) setError(res.error ?? "Sign in failed");
        }}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Northwind POS</p>
            <p className="text-xs text-muted-foreground">Staff sign in</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full">
          Sign in
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Demo accounts · cashier1 / 123 (Store 1) · cashier2 / 123 (Store 2) · admin / 123
          (all stores)
        </p>
      </form>
    </div>
  );
}
