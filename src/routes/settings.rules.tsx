import { createFileRoute, Link } from "@tanstack/react-router";
import { SettingsTabs } from "@/platforms/web/components/pos/settings/SettingsTabs";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/notify";

import { SettingsShell } from "@/platforms/web/components/pos/settings/SettingsShell";
import { SaveIndicator } from "@/platforms/web/components/pos/settings/SaveIndicator";
import { SettingsSections } from "@/platforms/web/components/pos/settings/SettingsSection";
import { AuthorizationRulesPanel } from "@/platforms/web/components/pos/settings/AuthorizationRulesPanel";
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
import { getIdleTimeout, saveIdleTimeout } from "@/lib/idle-timeout.functions";

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
  const { rules, loading, usingDefaults, backendError, refresh } = usePosRules();
  const { currentStore } = usePos();
  const { isAdmin, can } = useAuth();
  const mayEdit = isAdmin || can("can_access_pos_settings");

  const [draft, setDraft] = useState<PosRules>(rules);
  const [saving, setSaving] = useState(false);
  const [idle, setIdle] = useState(30);
  const [savingIdle, setSavingIdle] = useState(false);

  useEffect(() => {
    void getIdleTimeout({ data: { storeId: currentStore.id } })
      .then((r) => setIdle(r.minutes))
      .catch(() => undefined);
  }, [currentStore.id]);

  async function saveIdle() {
    setSavingIdle(true);
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        toast.error("Sign in with a supervisor account to change this");
        return;
      }
      const res = await saveIdleTimeout({
        data: { accessToken: auth.accessToken, storeId: currentStore.id, minutes: idle },
      });
      if (!res.ok) toast.error(res.error || "Could not save the idle limit");
      else toast.success("Idle limit saved");
    } finally {
      setSavingIdle(false);
    }
  }

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
      notifyError(e, "Could not save rules");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link to="/settings">
              <ArrowLeft className="size-4" /> All settings
            </Link>
          </Button>
        </div>

        <SettingsTabs current="/settings/rules" />

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

        {usingDefaults && !loading && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            The saved rules could not be read, so the strictest built-in settings are being
            enforced right now. Anything you save here may not take effect until the connection is
            back.
            {backendError ? <span className="mt-1 block text-xs opacity-80">{backendError}</span> : null}
          </p>
        )}

        <section className="rounded-lg border border-border bg-card px-5">
          <SettingsSections
            storageKey="rules"
            items={RULE_GROUPS.map((group) => ({
              id: group.id,
              title: group.label,
              blurb: group.blurb,
              content: (
                <div className="space-y-3 pb-2">
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
              ),
            }))}
          />
        </section>

        <AuthorizationRulesPanel
          storeId={currentStore.id}
          storeName={currentStore.name}
          mayEdit={mayEdit}
        />

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold">Idle session timeout</h2>
            <p className="text-xs text-muted-foreground">
              How long a till may sit untouched before it signs itself out. Individual people can
              be given their own limit in Staff Management.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
            <Label className="text-sm">Minutes of inactivity</Label>
            <Input
              aria-label="Idle session timeout in minutes"
              className="numeric h-8 w-28"
              inputMode="numeric"
              disabled={!mayEdit}
              value={String(idle)}
              onChange={(e) => setIdle(Math.max(1, Math.min(1440, Number(e.target.value) || 0)))}
            />
            {mayEdit && (
              <Button size="sm" variant="outline" disabled={savingIdle} onClick={() => void saveIdle()}>
                {savingIdle ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save limit
              </Button>
            )}
          </div>
        </section>

        {mayEdit && (
          <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
            <SaveIndicator dirty={dirty} saving={saving} />
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
    </SettingsShell>
  );
}