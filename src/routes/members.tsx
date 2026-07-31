import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, usePos } from "@/lib/pos-store";
import type { Member } from "@/lib/pos-types";
import { printMemberStatement } from "@/lib/pos-print";

export const Route = createFileRoute("/members")({
  head: () => ({
    meta: [
      { title: "Members — Northwind POS" },
      {
        name: "description",
        content:
          "Central membership register with tiers, loyalty point balances, lifetime spend and printable statements.",
      },
      { property: "og:title", content: "Members — Northwind POS" },
      { property: "og:description", content: "Loyalty tiers, points and member statements." },
    ],
  }),
  component: Members,
});

const blank = (n: number): Member => ({
  id: crypto.randomUUID(),
  code: `MB-${1000 + n + 1}`,
  name: "",
  phone: "",
  email: "",
  tier: "Bronze",
  points: 0,
  totalSpend: 0,
  joinedAt: new Date().toISOString().slice(0, 10),
});

function Members() {
  const { state, upsertMember, removeMember } = usePos();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Member | null>(null);

  const rows = state.members.filter((m) =>
    `${m.name} ${m.code} ${m.phone} ${m.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Central membership</h1>
            <p className="text-sm text-muted-foreground">
              {state.members.length} members · {state.members.reduce((a, m) => a + m.points, 0)} points
              outstanding
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="w-56 pl-9"
              />
            </div>
            <Button onClick={() => setDraft(blank(state.members.length))}>
              <Plus className="size-4" /> Enroll member
            </Button>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const visits = state.sales.filter((s) => s.memberId === m.id).length;
            return (
              <article key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      className="text-base font-semibold hover:text-primary"
                      onClick={() => setDraft(m)}
                    >
                      {m.name}
                    </button>
                    <p className="numeric text-[11px] text-muted-foreground">
                      {m.code} · joined {m.joinedAt}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      m.tier === "Gold"
                        ? "border-primary/50 text-primary"
                        : m.tier === "Silver"
                          ? "border-accent/50 text-accent"
                          : "text-muted-foreground"
                    }
                  >
                    {m.tier}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Points" value={String(m.points)} />
                  <Stat label="Spend" value={money(m.totalSpend)} />
                  <Stat label="Visits" value={String(visits)} />
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {m.phone} · {m.email}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printMemberStatement(m, state.sales)}
                  >
                    <Printer className="size-4" /> Statement
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      removeMember(m.id);
                      toast.success("Member removed");
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.name ? "Edit member" : "Enroll member"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Full name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tier</Label>
                <select
                  value={draft.tier}
                  onChange={(e) => setDraft({ ...draft, tier: e.target.value as Member["tier"] })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option>Bronze</option>
                  <option>Silver</option>
                  <option>Gold</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Points</Label>
                <Input
                  className="numeric"
                  value={draft.points}
                  onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date of birth</Label>
                <Input
                  type="date"
                  value={draft.birthday ?? ""}
                  onChange={(e) => setDraft({ ...draft, birthday: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                if (!draft?.name.trim()) {
                  toast.error("Member name is required");
                  return;
                }
                upsertMember(draft);
                setDraft(null);
                toast.success("Member saved");
              }}
            >
              Save member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="numeric text-sm font-semibold">{value}</dd>
    </div>
  );
}