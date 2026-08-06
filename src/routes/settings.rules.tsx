import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/pos-auth";
import { usePos } from "@/lib/pos-store";
import { usePosRules } from "@/lib/pos-rules.tsx";
import { RULE_GROUPS, type PosRules, type PosRuleKey } from "@/lib/pos-rules";
import { savePosRules } from "@/lib/pos-rules.functions";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";

export const Route = createFileRoute("/settings/rules")({
  head: () => ({
    meta: [
      { title: "POS Rules & Enforcement · Register Settings" },
      {
        name: "description",
        content:
          "Configure shift, discount, refund and terminal security rules enforced across every register.",
      },
      { property: "og:title", content: "POS Rules & Enforcement" },
      {
        property: "og:description",
        content: "Shift, discount, refund and terminal security rules for every till.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesSettings,
});

function RulesSettings() {
  const { rules, loading, refresh } = usePosRules();
  const { currentStore } = usePos();
  const { isAdmin, can } = useAuth();
  const mayEdit = isAdmin || can("can_access_pos_settings");

  const [draft, setDraft] = useState<PosRules>(rules);
  const [saving, setSaving] = useState(false);

  // Rules live in the database; the draft only mirrors the last server read.
  useEffect(() => setDraft(rules), [rules]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(rules);

  const set = (key: PosRuleKey, value: boolean | number) =>
    setDraft((d) => ({ ...d, [key]: value }) as PosRules);

  async function save() {
    setSaving(true);
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        toast.error("Sign in with a supervisor account to change rules");
        return;
      }
      const res = await savePosRules({
        data: {
          accessToken: auth.accessToken,
          storeId: currentStore.id,
          patch: draft as unknown as Record<string, boolean | number>,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not save rules");
        return;
      }
      refresh();
      toast.success("Rules saved");
    } catch (e) {
      toast.error((e as Error).message || "Could not save rules");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link to="/settings">
              <ArrowLeft className="size-4" /> All settings
            </Link>
          </Button>
        </div>

        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <ShieldCheck className="size-5 shrink-0 text-primary" /> POS rules &amp; enforcement
            </h1>
            <p className="text-sm text-muted-foreground">
              Operational limits for {currentStore.name}. Stored in the database and re-checked on
              the server for every till action — never cached in the browser.
            </p>
          </div>
          {loading && <Loader2 className="mt-2 size-4 shrink-0 animate-spin text-muted-foreground" />}
        </header>

        {!mayEdit && (
          <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            These rules are managed by an administrator. You can see what is enforced, but not
            change it.
          </p>
        )}

        {RULE_GROUPS.map((group) => (
          <section key={group.id} className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div>
              <h2 className="text-sm font-semibold">{group.label}</h2>
              <p className="text-xs text-muted-foreground">{group.blurb}</p>
            </div>
            <div className="space-y-3">
              {group.fields.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-border/60 pt-3 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <Label className="text-sm">{field.label}</Label>
                    <p className="text-xs text-muted-foreground">{field.blurb}</p>
                  </div>
                  {field.kind === "switch" ? (
                    <Switch
                      aria-label={field.label}
                      disabled={!mayEdit}
                      checked={Boolean(draft[field.key])}
                      onCheckedChange={(v) => set(field.key, v)}
                    />
                  ) : (
                    <Input
                      aria-label={field.label}
                      className="numeric h-8 w-28 shrink-0"
                      inputMode="decimal"
                      disabled={!mayEdit}
                      value={String(draft[field.key])}
                      onChange={(e) => set(field.key, Number(e.target.value) || 0)}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {mayEdit && (
          <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
            <span className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "All rules saved"}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : "Save rules"}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}