import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  STAFF_ROLES,
  fromDbRole,
  normalizePermissions,
  rolePermissions,
  toDbRole,
  type PermissionKey,
  type StaffRole,
} from "@/lib/permissions";
import {
  createStaffAccount,
  staffUserId,
} from "@/lib/pos-users";
import {
  cashierErrText,
  deleteCashier,
  listCashiers,
  setCashierPermissions,
  upsertCashier,
} from "@/lib/pos-cashiers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff Management — Northwind POS" },
      {
        name: "description",
        content:
          "One screen to create cashiers, supervisors and admins, edit their profile and switch every feature permission on or off.",
      },
      { property: "og:title", content: "Staff Management — Northwind POS" },
      {
        property: "og:description",
        content: "Unified staff profiles and the granular POS permission matrix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffManagement,
});

const sb = supabaseExternal as unknown as SupabaseClient;

/** Never surface an empty object as an error message. */
const errText = (e: unknown): string => {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const o = e as { message?: string; details?: string; hint?: string; code?: string };
  return o.message || o.details || o.hint || o.code || "Unexpected error";
};

type StaffRow = {
  /** cashiers live in public.cashiers, everyone else in public.app_users */
  kind: "account" | "cashier";
  /** cashiers.id (uuid) — empty for account rows */
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  store_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  permissions: Record<string, boolean>;
};

const NEW_USER = {
  user_id: "",
  pin: "",
  full_name: "",
  email: "",
  password: "",
  role: "cashier" as StaffRole,
  store_id: "",
};

/** "" / "none" in the create form both mean "All stores" (null in the DB). */
const formStoreId = (v: string) => (v && v !== "none" ? v : null);

function StaffManagement() {
  const { isAdmin } = useAuth();
  const { stores } = usePos();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(NEW_USER);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordReset, setPasswordReset] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("list_app_users");
    if (error) toast.error("Could not load staff", { description: error.message });
    const accounts = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const role = fromDbRole(r["role"] as string | null);
      return {
        kind: "account" as const,
        id: "",
        user_id: String(r["user_id"] ?? ""),
        full_name: String(r["full_name"] ?? ""),
        email: String(r["email"] ?? ""),
        role,
        store_id: (r["store_id"] as string | null) ?? null,
        is_active: r["is_active"] !== false,
        last_login_at: (r["last_login_at"] as string | null) ?? null,
        permissions: normalizePermissions(
          r["permissions"] as Record<string, unknown> | null,
          role,
        ),
      } satisfies StaffRow;
    }).filter((r) => r.role !== "cashier");

    let cashiers: StaffRow[] = [];
    try {
      cashiers = (await listCashiers()).map((c) => ({
        kind: "cashier" as const,
        id: c.id,
        user_id: c.username,
        full_name: c.full_name,
        email: "",
        role: "cashier" as StaffRole,
        store_id: c.store_id,
        is_active: c.is_active,
        last_login_at: c.last_login_at,
        permissions: c.permissions as unknown as Record<string, boolean>,
      }));
    } catch (e) {
      toast.error("Could not load cashiers", { description: cashierErrText(e) });
    }

    const mapped = [...accounts, ...cashiers];
    setRows(mapped);
    setSelectedId((prev) => prev ?? mapped[0]?.user_id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.user_id} ${r.full_name} ${r.email} ${r.role}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [rows, query],
  );

  const selected = rows.find((r) => r.user_id === selectedId) ?? null;

  const patchRow = (userId: string, patch: Partial<StaffRow>) =>
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, ...patch } : r)));

  const saveProfile = async (row: StaffRow) => {
    setSaving(true);
    if (row.kind === "cashier") {
      try {
        await upsertCashier({
          id: row.id,
          username: row.user_id,
          fullName: row.full_name,
          storeId: row.store_id,
          isActive: row.is_active,
        });
        toast.success("Profile saved");
      } catch (e) {
        toast.error("Could not save profile", { description: cashierErrText(e) });
      } finally {
        setSaving(false);
      }
      return;
    }
    const { error } = await sb.rpc("set_app_user_profile", {
      p_user_id: row.user_id,
      p_full_name: row.full_name,
      p_role: toDbRole(row.role),
      p_store_id: row.store_id,
      p_is_active: row.is_active,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not save profile", { description: error.message });
      return;
    }
    toast.success("Profile saved");
  };

  const togglePermission = async (row: StaffRow, key: PermissionKey, value: boolean) => {
    patchRow(row.user_id, { permissions: { ...row.permissions, [key]: value } });
    if (row.kind === "cashier") {
      try {
        await setCashierPermissions(row.id, { [key]: value });
      } catch (e) {
        toast.error("Could not update permission", { description: cashierErrText(e) });
        void load();
      }
      return;
    }
    const { error } = await sb.rpc("set_app_user_permissions", {
      p_user_id: row.user_id,
      p_permissions: { [key]: value },
    });
    if (error) {
      toast.error("Could not update permission", { description: error.message });
      void load();
    }
  };

  const setGroup = async (row: StaffRow, keys: readonly string[], value: boolean) => {
    const patch = Object.fromEntries(keys.map((k) => [k, value]));
    patchRow(row.user_id, { permissions: { ...row.permissions, ...patch } });
    if (row.kind === "cashier") {
      try {
        await setCashierPermissions(row.id, patch);
      } catch (e) {
        toast.error("Could not update permissions", { description: cashierErrText(e) });
        void load();
      }
      return;
    }
    const { error } = await sb.rpc("set_app_user_permissions", {
      p_user_id: row.user_id,
      p_permissions: patch,
    });
    if (error) {
      toast.error("Could not update permissions", { description: error.message });
      void load();
    }
  };

  const createUser = async () => {
    setCreating(true);
    try {
      if (form.role === "cashier") {
        const username = form.user_id.trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,}$/.test(username)) {
          toast.error("Enter a username (3+ characters, letters/numbers)");
          return;
        }
        if (!/^\d{6}$/.test(form.pin)) {
          toast.error("PIN must be exactly 6 digits");
          return;
        }
        try {
          await upsertCashier({
            username,
            fullName: form.full_name.trim() || username,
            pin: form.pin,
            storeId: form.store_id || null,
            isActive: true,
          });
        } catch (e) {
          toast.error("Could not create cashier", { description: cashierErrText(e) });
          return;
        }
        toast.success(`Cashier ${username} created`);
        setForm(NEW_USER);
        setDialogOpen(false);
        void load();
        return;
      }
      const email = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error("Enter a valid email address");
        return;
      }
      if (form.password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      const auth = await createStaffAccount({
        email,
        fullName: form.full_name || email,
        password: form.password,
        role: form.role === "admin" ? "admin" : "supervisor",
        storeId: formStoreId(form.store_id),
      });
      if (!auth.ok && !/already/i.test(auth.error ?? "")) {
        toast.error("Could not create account", { description: auth.error });
        return;
      }
      // Mirror the profile into app_users so roles/permissions resolve on login.
      const { error } = await sb.rpc("upsert_terminal_user", {
        p_user_id: staffUserId(email),
        p_full_name: form.full_name.trim() || email,
        p_role: toDbRole(form.role),
        p_store_id: formStoreId(form.store_id),
        p_email: email,
        // Legacy PIN column is still NOT NULL in the database; it is unused now.
        p_pin: String(Math.floor(1000 + Math.random() * 9000)),
        p_password: form.password,
      });
      if (error) {
        toast.error("Could not save staff profile", { description: errText(error) });
        return;
      }
      toast.success(`${form.role} account created`);
      setForm(NEW_USER);
      setDialogOpen(false);
      void load();
    } catch (e) {
      toast.error("Could not add staff member", { description: errText(e) });
    } finally {
      setCreating(false);
    }
  };

  const resetPassword = async (row: StaffRow) => {
    if (row.kind === "cashier") {
      if (!/^\d{6}$/.test(passwordReset)) {
        toast.error("PIN must be exactly 6 digits");
        return;
      }
      try {
        await upsertCashier({
          id: row.id,
          username: row.user_id,
          fullName: row.full_name,
          pin: passwordReset,
          storeId: row.store_id,
          isActive: row.is_active,
        });
        setPasswordReset("");
        toast.success("PIN updated");
      } catch (e) {
        toast.error("Could not update PIN", { description: cashierErrText(e) });
      }
      return;
    }
    if (passwordReset.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const { error } = await sb.rpc("upsert_terminal_user", {
      p_user_id: row.user_id,
      p_full_name: row.full_name,
      p_role: toDbRole(row.role),
      p_store_id: row.store_id,
      p_email: row.email,
      p_pin: String(Math.floor(1000 + Math.random() * 9000)),
      p_password: passwordReset,
    });
    setPasswordReset("");
    if (error) {
      toast.error("Could not update password", { description: error.message });
      return;
    }
    toast.success("Password updated for the next sign-in sync");
  };

  const removeUser = async (row: StaffRow) => {
    if (row.kind === "cashier") {
      try {
        await deleteCashier(row.id);
      } catch (e) {
        toast.error("Delete failed", { description: cashierErrText(e) });
        return;
      }
      setSelectedId(null);
      toast.success(`${row.full_name || row.user_id} removed`);
      void load();
      return;
    }
    const { error } = await sb.rpc("delete_terminal_user", { p_user_id: row.user_id });
    if (error) {
      toast.error("Delete failed", { description: error.message });
      return;
    }
    setSelectedId(null);
    toast.success(`${row.full_name || row.user_id} removed`);
    void load();
  };

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Supervisors only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Staff management is restricted to supervisor and admin accounts.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Staff management</h1>
            <p className="text-sm text-muted-foreground">
              Profiles, roles and every feature permission in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="size-4" /> New staff
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create staff account</DialogTitle>
                  <DialogDescription>
                    Cashiers sign in with a username and 6-digit PIN. Supervisors and admins sign
                    in with email and password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nu-name">Full name</Label>
                    <Input
                      id="nu-name"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  {form.role === "cashier" ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="nu-username">Username</Label>
                        <Input
                          id="nu-username"
                          autoComplete="off"
                          placeholder="cashier101"
                          value={form.user_id}
                          onChange={(e) =>
                            setForm({ ...form, user_id: e.target.value.replace(/\s+/g, "") })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="nu-pin">6-digit PIN</Label>
                        <Input
                          id="nu-pin"
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          autoComplete="off"
                          value={form.pin}
                          onChange={(e) =>
                            setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="nu-email">Email</Label>
                        <Input
                          id="nu-email"
                          type="email"
                          autoComplete="off"
                          placeholder="supervisor@store.com"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="nu-pass">Password</Label>
                        <Input
                          id="nu-pass"
                          type="password"
                          autoComplete="new-password"
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <Label>Assigned store</Label>
                    <Select
                      value={form.store_id}
                      onValueChange={(v) => setForm({ ...form, store_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select store" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.role !== "cashier" && (
                          <SelectItem value="none">All stores</SelectItem>
                        )}
                        {stores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.code} · {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => void createUser()} disabled={creating}>
                    {creating && <Loader2 className="size-4 animate-spin" />} Create account
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Master list */}
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 p-3">
              <Search className="size-4 text-muted-foreground" />
              <Input
                className="h-8"
                placeholder="Search staff"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Separator />
            <ul className="max-h-[70vh] overflow-y-auto">
              {(
                [
                  ["Supervisors & admins", filtered.filter((r) => r.kind === "account")],
                  ["Cashiers", filtered.filter((r) => r.kind === "cashier")],
                ] as const
              ).flatMap(([label, group]) => [
                <li
                  key={`h-${label}`}
                  className="bg-muted/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label} · {group.length}
                </li>,
                ...group.map((r) => (
                <li key={`${r.kind}-${r.user_id}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.user_id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
                      selectedId === r.user_id && "bg-accent",
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {r.full_name || r.user_id}
                      </span>
                      {!r.is_active && (
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          Inactive
                        </Badge>
                      )}
                    </span>
                    <span className="numeric text-[11px] capitalize text-muted-foreground">
                      {r.user_id} · {r.role}
                    </span>
                  </button>
                </li>
                )),
              ])}
              {!loading && !filtered.length && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No staff accounts yet.
                </li>
              )}
            </ul>
          </section>

          {/* Detail */}
          {selected ? (
            <section className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">
                    {selected.full_name || selected.user_id}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {selected.email || "No email"} · last login{" "}
                    {selected.last_login_at
                      ? new Date(selected.last_login_at).toLocaleString()
                      : "never"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void removeUser(selected)}
                >
                  <Trash2 className="size-4 text-destructive" /> Remove
                </Button>
              </div>
              <Separator />

              <Tabs defaultValue="profile" className="p-5">
                <TabsList>
                  <TabsTrigger value="profile">Profile details</TabsTrigger>
                  <TabsTrigger value="permissions">Permission matrix</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-4 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Full name</Label>
                      <Input
                        value={selected.full_name}
                        onChange={(e) =>
                          patchRow(selected.user_id, { full_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{selected.kind === "cashier" ? "Username" : "User ID"}</Label>
                      <Input className="numeric" value={selected.user_id} readOnly />
                    </div>
                    {selected.kind === "cashier" ? (
                      <div className="space-y-1">
                        <Label>Role</Label>
                        <Input value="Cashier (PIN login)" readOnly />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label>Email</Label>
                          <Input value={selected.email} readOnly />
                        </div>
                        <div className="space-y-1">
                          <Label>Role</Label>
                          <Select
                            value={selected.role}
                            onValueChange={(v) => {
                              const role = v as StaffRole;
                              patchRow(selected.user_id, {
                                role,
                                permissions: rolePermissions(role),
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAFF_ROLES.filter((r) => r !== "cashier").map((r) => (
                                <SelectItem key={r} value={r} className="capitalize">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <Label>Assigned store</Label>
                      <Select
                        value={selected.store_id ?? "none"}
                        onValueChange={(v) =>
                          patchRow(selected.user_id, { store_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">All stores</SelectItem>
                          {stores.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.code} · {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={selected.is_active}
                          onCheckedChange={(v) =>
                            patchRow(selected.user_id, { is_active: v })
                          }
                        />
                        Active
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs">
                        <KeyRound className="size-3.5" />{" "}
                        {selected.kind === "cashier" ? "Set new 6-digit PIN" : "Set new password"}
                      </Label>
                      <Input
                        className="w-48"
                        type="password"
                        inputMode={selected.kind === "cashier" ? "numeric" : undefined}
                        maxLength={selected.kind === "cashier" ? 6 : undefined}
                        autoComplete="new-password"
                        value={passwordReset}
                        onChange={(e) =>
                          setPasswordReset(
                            selected.kind === "cashier"
                              ? e.target.value.replace(/\D/g, "").slice(0, 6)
                              : e.target.value,
                          )
                        }
                      />
                    </div>
                    <Button variant="outline" onClick={() => void resetPassword(selected)}>
                      {selected.kind === "cashier" ? "Update PIN" : "Update password"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Credentials are stored securely and can never be read back.
                    </p>
                  </div>

                  <Button onClick={() => void saveProfile(selected)} disabled={saving}>
                    {saving && <Loader2 className="size-4 animate-spin" />} Save profile
                  </Button>
                </TabsContent>

                <TabsContent value="permissions" className="space-y-5 pt-4">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.id} className="rounded-md border border-border">
                      <div className="flex items-center gap-2 px-4 py-2">
                        <h3 className="text-sm font-semibold">{group.label}</h3>
                        <div className="ml-auto flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => void setGroup(selected, group.keys, true)}
                          >
                            All on
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => void setGroup(selected, group.keys, false)}
                          >
                            All off
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        {group.keys.map((key) => (
                          <label
                            key={key}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span>{PERMISSION_LABELS[key as PermissionKey]}</span>
                            <Switch
                              checked={!!selected.permissions[key]}
                              onCheckedChange={(v) =>
                                void togglePermission(selected, key as PermissionKey, v)
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </section>
          ) : (
            <section className="flex items-center justify-center rounded-lg border border-border bg-card p-10 text-sm text-muted-foreground">
              Select a staff member to view their profile and permissions.
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
