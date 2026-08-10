import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { listDeviceSessions, revokeDeviceSessions } from "@/lib/user-sessions.functions";

type Row = {
  id: string;
  kind: string;
  label: string | null;
  staff_user_id: string | null;
  branch_id: string | null;
  terminal_id: string | null;
  platform: string | null;
  idle_timeout_minutes: number;
  last_activity_at: string;
  is_revoked: boolean;
  created_at: string;
};

function ActiveSessions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setError("Sign in with an administrator account to manage terminals.");
      setLoading(false);
      return;
    }
    const res = await listDeviceSessions({ data: { accessToken } });
    setError(res.ok ? "" : res.error);
    setRows((res.sessions ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusy(id);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const res = await revokeDeviceSessions({
      data: { accessToken, sessionId: id, reason: "remote reset" },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Terminal signed out. It will return to the sign-in screen on its next call.");
    void load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nobody is signed in right now.</p>;

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">
                {row.label || row.staff_user_id || "Unnamed device"}
              </span>
              <Badge variant={row.is_revoked ? "outline" : "secondary"}>
                {row.is_revoked ? "Signed out" : row.kind}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                row.platform,
                row.branch_id ? `Branch ${row.branch_id}` : null,
                row.terminal_id ? `Terminal ${row.terminal_id.slice(0, 8)}` : null,
                `Idle limit ${row.idle_timeout_minutes} min`,
                `Last seen ${new Date(row.last_activity_at).toLocaleString()}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={row.is_revoked || busy === row.id}
            onClick={() => void revoke(row.id)}
          >
            {busy === row.id ? "Resetting…" : "Remote reset"}
          </Button>
        </div>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/settings/sessions")({
  head: () => ({
    meta: [
      { title: "Active Sessions — POS Settings" },
      {
        name: "description",
        content:
          "See every terminal signed in to the POS and sign any of them out instantly from one place.",
      },
      { property: "og:title", content: "Active Sessions — POS Settings" },
      {
        property: "og:description",
        content: "Live list of signed-in tills with an instant remote sign-out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Active sessions"
      description="Every device signed in to the company data. A remote reset ends that session at once — the terminal returns to the sign-in screen on its next call."
    >
      <ActiveSessions />
    </SettingsFrame>
  ),
});