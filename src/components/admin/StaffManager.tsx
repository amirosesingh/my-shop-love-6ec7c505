/**
 * Staff accounts as one roster: create people, switch them on or off, and
 * bring any leftover old cashier records onto real accounts.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { usePos } from "@/lib/pos-store";
import { notifyError } from "@/lib/notify";
import {
  createStaffMember,
  looksLikeEmail,
  migrateLegacyCashiers,
  toggleStaffStatus,
} from "@/lib/staff-admin";
import { getRolesWithPermissions, type RoleDef } from "@/lib/role-admin";

type Row = {
  user_id: string;
  full_name: string;
  role: string;
  role_slug: string;
  email: string;
  store_id: string | null;
  is_active: boolean;
};

const EMPTY = {
  displayName: "",
  username: "",
  pin: "",
  password: "",
  roleSlug: "cashier",
  branchId: "none",
  active: true,
};

export function StaffManager() {
  const { stores } = usePos();
  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [pinFor, setPinFor] = useState<Row | null>(null);
  const [newPin, setNewPin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error }, roleList] = await Promise.all([
        supabaseExternal.rpc("list_app_users"),
        getRolesWithPermissions(),
      ]);
      if (error) throw error;
      setRoles(roleList);
      setRows(
        ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          user_id: String(r["user_id"] ?? ""),
          full_name: String(r["full_name"] ?? ""),
          role: String(r["role"] ?? "staff"),
          role_slug: String(r["role_slug"] ?? r["role"] ?? "cashier"),
          email: String(r["email"] ?? ""),
          store_id: (r["store_id"] as string | null) ?? null,
          is_active: r["is_active"] !== false,
        })),
      );
    } catch (e) {
      notifyError(e, "The staff roster could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const role = roles.find((r) => r.slug === form.roleSlug);
    setSaving(true);
    try {
      await createStaffMember({
        displayName: form.displayName.trim(),
        username: form.username.trim().toLowerCase(),
        pin: form.pin,
        password: form.password,
        branchId: form.branchId === "none" ? null : form.branchId,
        roleSlug: form.roleSlug,
        baseRole: role?.baseLevel ?? "cashier",
        active: form.active,
      });
      toast.success(
        emailMode
          ? `${form.displayName || form.username} will receive a confirmation email`
          : `${form.displayName || form.username} can now sign in with their PIN`,
      );
      setOpen(false);
      setForm({ ...EMPTY });
      void load();
    } catch (e) {
      notifyError(e, "The account could not be created");
    } finally {
      setSaving(false);
    }
  };

  /** Re-set someone's PIN without ever showing the old one. */
  const changePin = async () => {
    if (!pinFor) return;
    const role = roles.find((r) => r.slug === pinFor.role_slug);
    setSaving(true);
    try {
      await createStaffMember({
        displayName: pinFor.full_name || pinFor.user_id,
        username: pinFor.user_id,
        pin: newPin,
        branchId: pinFor.store_id,
        roleSlug: role?.slug ?? "cashier",
        baseRole: role?.baseLevel ?? "cashier",
        active: pinFor.is_active,
      });
      toast.success("The new PIN is ready to use");
      setPinFor(null);
      setNewPin("");
    } catch (e) {
      notifyError(e, "That PIN could not be changed");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: Row, active: boolean) => {
    setBusy(row.user_id);
    setRows((rs) => rs.map((r) => (r.user_id === row.user_id ? { ...r, is_active: active } : r)));
    try {
      await toggleStaffStatus(row.user_id, active);
    } catch (e) {
      notifyError(e, "That account could not be updated");
      void load();
    } finally {
      setBusy("");
    }
  };

  const migrate = async () => {
    setBusy("migrate");
    try {
      const n = await migrateLegacyCashiers();
      toast.success(n ? `${n} cashier account(s) brought across` : "Everyone already has an account");
      void load();
    } catch (e) {
      notifyError(e, "The old cashier records could not be brought across");
    } finally {
      setBusy("");
    }
  };

  const identifier = form.username.trim().toLowerCase();
  const emailMode = looksLikeEmail(identifier);
  const pinValid = /^\d{4,6}$/.test(form.pin);
  const canCreate = emailMode ? form.password.length >= 8 : pinValid && identifier.length >= 2;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Staff accounts</h2>
          <p className="text-xs text-muted-foreground">
            Everyone signs in with their own verified account — cashiers with a 4-digit PIN.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void migrate()} disabled={!!busy}>
            {busy === "migrate" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Users className="size-4" />
            )}
            Bring old cashiers across
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="size-4" /> New staff
          </Button>
        </div>
      </header>

      <Separator />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2">Name</th>
              <th className="py-2">Username / email</th>
              <th className="py-2">Level</th>
              <th className="py-2">Branch</th>
              <th className="py-2">Sign-in</th>
              <th className="py-2 text-right">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-border/60">
                <td className="py-2 pr-2">{r.full_name || r.user_id}</td>
                <td className="numeric py-2 pr-2 text-muted-foreground">{r.user_id}</td>
                <td className="py-2 pr-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {r.role}
                  </Badge>
                </td>
                <td className="py-2 pr-2 text-muted-foreground">
                  {stores.find((s) => s.id === r.store_id)?.name ?? "All branches"}
                </td>
                <td className="py-2 pr-2">
                  {r.email && !r.email.endsWith("@pos-internal.local") ? (
                    <span className="text-xs text-muted-foreground">Email &amp; password</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        setPinFor(r);
                        setNewPin("");
                      }}
                    >
                      <KeyRound className="size-3.5" /> PIN set · Change
                    </Button>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Switch
                    checked={r.is_active}
                    disabled={busy === r.user_id}
                    onCheckedChange={(v) => void setActive(r, v)}
                    aria-label={`${r.full_name || r.user_id} active`}
                  />
                </td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  No staff accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New staff member</DialogTitle>
            <DialogDescription>
              A username creates a till account that signs in with a PIN straight away. A real
              email address creates a back-office account with its own password and a
              confirmation email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sm-name">Display name</Label>
              <Input
                id="sm-name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sm-user">Username or email address</Label>
              <Input
                id="sm-user"
                placeholder="cashier101 or owner@store.com"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.replace(/\s+/g, "") })
                }
              />
              <p className="text-[11px] text-muted-foreground">
                {emailMode
                  ? "This person signs in with their email address and password, and must confirm the email first."
                  : "No “@” means a till account: the person taps their name and PIN on the terminal."}
              </p>
            </div>
            {emailMode ? (
              <div className="space-y-1">
                <Label htmlFor="sm-password">Password</Label>
                <Input
                  id="sm-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="sm-pin">PIN (4 to 6 digits)</Label>
                <Input
                  id="sm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="new-password"
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })
                  }
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Role</Label>
              <Select
                value={form.roleSlug}
                onValueChange={(v) => setForm({ ...form, roleSlug: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.slug} value={r.slug}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm({ ...form, branchId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All branches</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              Activate immediately
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => void create()} disabled={saving || !canCreate}>
              {saving && <Loader2 className="size-4 animate-spin" />} Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pinFor} onOpenChange={(v) => !v && setPinFor(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Change PIN</DialogTitle>
            <DialogDescription>
              {pinFor?.full_name || pinFor?.user_id} will use the new PIN at the next sign-in.
              Existing PINs are never shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="sm-newpin">New PIN (4 to 6 digits)</Label>
            <Input
              id="sm-newpin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => void changePin()} disabled={saving || !/^\d{4,6}$/.test(newPin)}>
              {saving && <Loader2 className="size-4 animate-spin" />} Save PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}