import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/pos-auth";
import { TerminalUsersPanel } from "@/components/pos/TerminalUsersPanel";
import { usePos } from "@/lib/pos-store";
import {
  cashierEmail,
  createCashierAccount,
  createSupervisorAccount,
} from "@/lib/pos-users";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Management — Northwind POS" },
      {
        name: "description",
        content:
          "Create cashier accounts with a User ID and PIN, or supervisor accounts with email and password.",
      },
      { property: "og:title", content: "User Management — Northwind POS" },
      {
        property: "og:description",
        content: "Provision cashier, supervisor and admin accounts for the POS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, isSupervisor } = useAuth();
  const { stores } = usePos();

  const [userId, setUserId] = useState("");
  const [cashierName, setCashierName] = useState("");
  const [pin, setPin] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [cashierBusy, setCashierBusy] = useState(false);

  const [supName, setSupName] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supPassword, setSupPassword] = useState("");
  const [supRole, setSupRole] = useState<"supervisor" | "admin">("supervisor");
  const [supBusy, setSupBusy] = useState(false);

  if (!isAdmin && !isSupervisor) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Supervisors only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Only supervisor or admin accounts can manage users.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const addCashier = async () => {
    if (!/^[a-z0-9-]+$/i.test(userId.trim())) {
      toast.error("Enter a User ID (letters, numbers or dashes)");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    setCashierBusy(true);
    const res = await createCashierAccount({
      userId,
      fullName: cashierName || userId,
      pin,
      storeId: storeId || null,
    });
    setCashierBusy(false);
    if (!res.ok) {
      toast.error("Could not create cashier", { description: res.error });
      return;
    }
    toast.success(`Cashier ${userId} created`, {
      description: `Signs in with User ID ${userId.trim()} and their PIN.`,
    });
    setUserId("");
    setCashierName("");
    setPin("");
  };

  const addSupervisor = async () => {
    if (!supEmail.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (supPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSupBusy(true);
    const res = await createSupervisorAccount({
      email: supEmail,
      fullName: supName || supEmail,
      password: supPassword,
      role: supRole,
    });
    setSupBusy(false);
    if (!res.ok) {
      toast.error("Could not create account", { description: res.error });
      return;
    }
    toast.success(`${supRole} account created`, {
      description: res.needsConfirmation
        ? "Ask them to confirm the email invitation before signing in."
        : "They can sign in from the Supervisor / Admin tab.",
    });
    setSupName("");
    setSupEmail("");
    setSupPassword("");
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">User management</h1>
          <p className="text-sm text-muted-foreground">
            Every account lives in backend authentication. Cashiers sign in with a User ID and PIN;
            supervisors and admins sign in with email and password.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card">
            <h2 className="flex items-center gap-2 px-5 py-3 text-sm font-semibold">
              <UserPlus className="size-4 text-primary" /> New cashier
            </h2>
            <Separator />
            <div className="space-y-4 p-5">
              <div className="space-y-1">
                <Label htmlFor="cashier-id">User ID</Label>
                <Input
                  id="cashier-id"
                  placeholder="101"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Login identity: {userId.trim() ? cashierEmail(userId) : "101@store.internal"}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cashier-name">Full name</Label>
                <Input
                  id="cashier-name"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cashier-pin">4-digit PIN</Label>
                <Input
                  id="cashier-pin"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1">
                <Label>Assigned store</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={cashierBusy} onClick={() => void addCashier()}>
                {cashierBusy && <Loader2 className="size-4 animate-spin" />}
                Create cashier
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <h2 className="flex items-center gap-2 px-5 py-3 text-sm font-semibold">
              <UserPlus className="size-4 text-primary" /> New supervisor / admin
            </h2>
            <Separator />
            <div className="space-y-4 p-5">
              <div className="space-y-1">
                <Label htmlFor="sup-name">Full name</Label>
                <Input
                  id="sup-name"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-email">Email</Label>
                <Input
                  id="sup-email"
                  type="email"
                  placeholder="supervisor@store.com"
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-password">Password</Label>
                <Input
                  id="sup-password"
                  type="password"
                  value={supPassword}
                  onChange={(e) => setSupPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={supRole}
                  onValueChange={(v) => setSupRole(v as "supervisor" | "admin")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={supBusy} onClick={() => void addSupervisor()}>
                {supBusy && <Loader2 className="size-4 animate-spin" />}
                Create account
              </Button>
            </div>
          </section>
        </div>

        <TerminalUsersPanel />
      </div>
    </AppShell>
  );
}