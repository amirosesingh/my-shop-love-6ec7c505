import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { TerminalUsersPanel } from "@/components/pos/TerminalUsersPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { APP_ROLES, useAuth, type AppRole } from "@/lib/pos-auth";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "User Roles & Access — Northwind POS" },
      {
        name: "description",
        content:
          "Admin screen to grant admin, manager or staff backend roles to signed-in POS accounts.",
      },
      { property: "og:title", content: "User Roles & Access — Northwind POS" },
      {
        property: "og:description",
        content: "Grant admin, manager or staff database roles to POS accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RolesPage,
});

// `app_users` / `user_roles` live in the POS database but not in the generated types.
const sb = supabaseExternal as unknown as SupabaseClient;

type AppUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  user_code: string | null;
  role: AppRole | null;
};

function RolesPage() {
  const { isAdmin, authUserId } = useAuth();
  const [accounts, setAccounts] = useState<AppUserRow[]>([]);
  const [roles, setRoles] = useState<Record<string, AppRole[]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    // Read accounts from public.app_users. The table itself exposes pin_hash /
    // auth_secret, so it is queried through the security-definer listing which
    // returns only the safe columns.
    const [{ data: userRows, error: pErr }, { data: roleRows, error: rErr }] = await Promise.all([
      sb.rpc("list_app_users"),
      sb.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || rErr) {
      toast.error("Could not load accounts", {
        description: (pErr ?? rErr)?.message,
      });
    }
    const rows = (userRows ?? []) as {
      auth_user_id: string | null;
      user_code: string | null;
      full_name: string | null;
      email: string | null;
      role: AppRole | null;
    }[];
    setAccounts(
      rows
        .filter((r) => !!r.auth_user_id)
        .map((r) => ({
          id: r.auth_user_id as string,
          email: r.email,
          full_name: r.full_name,
          user_code: r.user_code,
          role: r.role,
        })),
    );
    const map: Record<string, AppRole[]> = {};
    for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
      (map[r.user_id] ??= []).push(r.role);
    }
    setRoles(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const toggle = async (userId: string, role: AppRole, next: boolean) => {
    if (userId === authUserId && role === "admin" && !next) {
      toast.error("You cannot remove your own admin role");
      return;
    }
    const { error } = next
      ? await sb.from("user_roles").insert({ user_id: userId, role })
      : await sb.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) {
      toast.error("Role update failed", { description: error.message });
      return;
    }
    setRoles((prev) => {
      const current = prev[userId] ?? [];
      return {
        ...prev,
        [userId]: next ? [...current, role] : current.filter((r) => r !== role),
      };
    });
    toast.success(`${role} ${next ? "granted" : "revoked"}`);
  };

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Admin only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Only accounts with the admin role can assign backend access.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const filtered = accounts.filter((p) =>
    `${p.email ?? ""} ${p.full_name ?? ""} ${p.user_code ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">User roles &amp; access</h1>
            <p className="text-sm text-muted-foreground">
              Grant database roles to signed-in accounts. Read access needs any sign-in; creating or
              editing records requires staff, manager or admin.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="w-56"
              placeholder="Search name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="flex items-center gap-2 px-5 py-3 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Backend accounts
          </h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>User ID</TableHead>
                {APP_ROLES.map((r) => (
                  <TableHead key={r} className="capitalize">
                    {r}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.full_name || p.email || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </TableCell>
                  <TableCell className="numeric text-xs text-muted-foreground">
                    {p.user_code || p.id}
                  </TableCell>
                  {APP_ROLES.map((r) => (
                    <TableCell key={r}>
                      <Switch
                        checked={(roles[p.id] ?? []).includes(r)}
                        onCheckedChange={(v) => void toggle(p.id, r, v)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!loading && !filtered.length && (
                <TableRow>
                  <TableCell colSpan={2 + APP_ROLES.length} className="py-10 text-center text-muted-foreground">
                    No accounts found. Staff appear here after they create an account on the sign-in
                    screen.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <TerminalUsersPanel />
      </div>
    </AppShell>
  );
}
