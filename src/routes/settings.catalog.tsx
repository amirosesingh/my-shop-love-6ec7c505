import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { useAuth } from "@/lib/pos-auth";
import {
  deleteCategory,
  deleteUnit,
  saveCategory,
  saveUnit,
  topCategories,
  useCategories,
  useUnits,
} from "@/lib/catalog-meta";

export const Route = createFileRoute("/settings/catalog")({
  head: () => ({
    meta: [
      { title: "Categories & Units — Northwind POS" },
      {
        name: "description",
        content:
          "Manage product categories, sub-categories, groups and the units of measure used across the catalogue.",
      },
      { property: "og:title", content: "Categories & Units — Northwind POS" },
      {
        property: "og:description",
        content: "Catalogue classification and unit of measure setup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogMetaSettings,
});

function CatalogMetaSettings() {
  const { can } = useAuth();
  const allowed = can("can_manage_categories");
  const categories = useCategories();
  const units = useUnits();

  const [catName, setCatName] = useState("");
  const [catParent, setCatParent] = useState("none");
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitDecimal, setUnitDecimal] = useState(false);

  const parents = useMemo(() => topCategories(categories), [categories]);
  const childrenOf = (id: string) =>
    categories.filter((c) => c.parentId === id).sort((a, b) => a.name.localeCompare(b.name));

  async function addCategory() {
    const name = catName.trim();
    if (!name) return toast.error("Give the category a name");
    try {
      await saveCategory({
        name,
        parentId: catParent === "none" ? null : catParent,
        sort: categories.length + 1,
      });
      setCatName("");
      toast.success(catParent === "none" ? "Category added" : "Sub-category added");
    } catch {
      toast.error("Could not save that category");
    }
  }

  async function addUnit() {
    const code = unitCode.trim().toLowerCase();
    if (!code) return toast.error("Give the unit a short code, e.g. kg");
    try {
      await saveUnit({
        code,
        name: unitName.trim() || code,
        allowDecimal: unitDecimal,
        sort: units.length + 1,
      });
      setUnitCode("");
      setUnitName("");
      setUnitDecimal(false);
      toast.success("Unit saved");
    } catch {
      toast.error("Could not save that unit");
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Categories & Units</h1>
          <p className="text-sm text-muted-foreground">
            Group the catalogue into categories and sub-categories, and set the units items are
            sold in.
          </p>
        </header>

        {!allowed && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            You can view this setup, but changing it needs the catalogue management permission.
          </p>
        )}

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-medium">Product categories</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Rackets, Strings, Grips…"
                className="h-9 w-56"
                disabled={!allowed}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sits under</Label>
              <ThemedSelect
                value={catParent}
                onChange={setCatParent}
                ariaLabel="Parent category"
                className="w-52"
                options={[
                  { value: "none", label: "Top level (group)" },
                  ...parents.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <Button onClick={addCategory} disabled={!allowed}>
              <Plus className="size-4" /> Add
            </Button>
          </div>

          <div className="divide-y divide-border rounded-md border border-border">
            {parents.map((p) => (
              <div key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!allowed}
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      await deleteCategory(p.id);
                      toast.success(`${p.name} removed`);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {childrenOf(p.id).map((c) => (
                    <Badge key={c.id} variant="outline" className="gap-1">
                      {c.name}
                      <button
                        type="button"
                        className="text-destructive"
                        aria-label={`Delete ${c.name}`}
                        disabled={!allowed}
                        onClick={async () => {
                          await deleteCategory(c.id);
                        }}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                  {!childrenOf(p.id).length && (
                    <span className="text-xs text-muted-foreground">No sub-categories yet.</span>
                  )}
                </div>
              </div>
            ))}
            {!parents.length && (
              <p className="p-4 text-sm text-muted-foreground">
                No categories yet — add your first group above.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-medium">Units of measure</h2>
          <p className="text-xs text-muted-foreground">
            Decimal units allow fractional quantities at the till (0.25 kg, 3.5 m).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                placeholder="kg"
                className="h-9 w-28"
                disabled={!allowed}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Kilogram"
                className="h-9 w-52"
                disabled={!allowed}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                checked={unitDecimal}
                onCheckedChange={setUnitDecimal}
                disabled={!allowed}
                aria-label="Allow decimal quantities"
              />
              <span className="text-sm">Allow decimals</span>
            </div>
            <Button onClick={addUnit} disabled={!allowed}>
              <Plus className="size-4" /> Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <Badge key={u.code} variant="outline" className="gap-2 py-1">
                <span className="numeric font-medium">{u.code}</span>
                <span className="text-muted-foreground">{u.name}</span>
                {u.allowDecimal && <span className="text-[10px] text-accent">decimal</span>}
                <button
                  type="button"
                  className="text-destructive"
                  aria-label={`Delete unit ${u.code}`}
                  disabled={!allowed}
                  onClick={async () => {
                    await deleteUnit(u.id, u.code);
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
