import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { APP_ROLES, type AppRole } from "@/lib/pos-auth";

const sb = supabaseExternal as unknown as SupabaseClient;

type TerminalRow = {
  user_code: string;
  full_name: string;
  role: AppRole;
  store_id: string | null;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
};

const EMPTY = {
  user_code: "",
  full_name: "",
  role: "staff" as AppRole,
  store_id: "",
  email: "",
  pin: "",
  password: "",
};

/** Admin provisioning for User ID + PIN terminal logins. PINs are hashed in the database. */
export function TerminalUsersPanel() {
  const [rows, setRows] = useState<TerminalRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("list_terminal_users");
    if (error) toast.error("Could not load terminal users", { description: error.message });
    setRows((data ?? []) as TerminalRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!/^\d{4}$/.test(form.pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    setSaving(true);
    const { error } = await sb.rpc("upsert_terminal_user", {
      p_user_code: form.user_code,
      p_full_name: form.full_name,
      p_role: form.role,
      p_store_id: form.store_id || null,
      p_email: form.email,
      p_pin: form.pin,
      p_password: form.password,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not save terminal user", { description: error.message });
      return;
    }
    // The PIN only ever lived in this form's memory.
    setForm(EMPTY);
    toast.success("Terminal user saved");
    void load();
  };

  const remove = async (code: string) => {
    const { error } = await sb.rpc("delete_terminal_user", { p_user_code: code });
    if (error) {
      toast.error("Delete failed", { description: error.message });
      return;
    }
    void load();
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="flex items-center gap-2 px-5 py-3 text-sm font-semibold">
        <KeyRound className="size-4 text-primary" /> Terminal logins (User ID + PIN)
      </h2>
      <Separator />

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="tu-code">User ID</Label>
          <Input
            id="tu-code"
            value={form.user_code}
            placeholder="EMP-101"
            onChange={(e) => setForm({ ...form, user_code: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tu-name">Full name</Label>
          <Input
            id="tu-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <Select
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as AppRole })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tu-store">Assigned store id</Label>
          <Input
            id="tu-store"
            value={form.store_id}
            placeholder="s1"
            onChange={(e) => setForm({ ...form, store_id: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tu-email">Backend account email</Label>
          <Input
            id="tu-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tu-password">Backend account password</Label>
          <Input
            id="tu-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tu-pin">4-digit PIN</Label>
          <Input
            id="tu-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save terminal user
          </Button>
        </div>
        <p className="col-span-full text-[11px] text-muted-foreground">
          The PIN is hashed with bcrypt inside the database and can never be read back. The backend
          account password is released only after a correct PIN so the till can open a real session.
        </p>
      </div>

      <Separator />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.user_code}>
              <TableCell className="font-medium">{r.user_code}</TableCell>
              <TableCell>
                {r.full_name}
                <p className="text-xs text-muted-foreground">{r.email}</p>
              </TableCell>
              <TableCell className="capitalize">{r.role}</TableCell>
              <TableCell>{r.store_id ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.last_login_at ? new Date(r.last_login_at).toLocaleString() : "Never"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${r.user_code}`}
                  onClick={() => void remove(r.user_code)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && !rows.length && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No terminal logins yet. Add one above so cashiers can sign in with a User ID and PIN.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
