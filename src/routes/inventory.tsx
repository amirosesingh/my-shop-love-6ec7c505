import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeftRight, Inbox, Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, stockAt, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { Switch } from "@/components/ui/switch";
import { BulkImportDialog } from "@/components/pos/BulkImportDialog";
import type { Product } from "@/lib/pos-types";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Northwind POS" },
      {
        name: "description",
        content: "Track stock levels, costs, margins and reorder alerts for every product in the store.",
      },
      { property: "og:title", content: "Inventory — Northwind POS" },
      { property: "og:description", content: "Stock levels, costs and reorder alerts." },
    ],
  }),
  component: Inventory,
});

const blank = (storeId: string): Product => ({
  id: crypto.randomUUID(),
  name: "",
  sku: "",
  barcode: "",
  category: "General",
  price: 0,
  cost: 0,
  ecomPrice: 0,
  ecomVisible: false,
  stockByStore: { [storeId]: 0 },
  reorderLevel: 10,
  taxRate: 0.05,
});

function Inventory() {
  const { state, stores, currentStore, upsertProduct, removeProduct, adjustStock } = usePos();
  const { can } = useAuth();
  const showMoney = can("financials");
  const canEdit = can("products");
  const canEcom = can("ecommerce");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const rows = state.products.filter((p) =>
    `${p.name} ${p.sku} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const allShownSelected = rows.length > 0 && rows.every((p) => selected.includes(p.id));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  function goToTransfers(kind: "transfer" | "request") {
    if (!selected.length) {
      toast.error("Select at least one product first");
      return;
    }
    navigate({ to: "/transfers", search: { items: selected.join(","), kind } });
  }

  const lowStock = state.products.filter(
    (p) => stockAt(p, currentStore.id) <= p.reorderLevel,
  );
  const stockValue = state.products.reduce(
    (a, p) => a + p.cost * stockAt(p, currentStore.id),
    0,
  );

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Inventory · {currentStore.name}</h1>
            <p className="text-sm text-muted-foreground">
              {state.products.length} products ·{" "}
              {showMoney && (
                <>
                  stock value <span className="numeric">{money(stockValue)}</span> ·{" "}
                </>
              )}
              <span className="text-warning">{lowStock.length} below reorder level</span>
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products"
                className="w-56 pl-9"
              />
            </div>
            {canEdit && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                📥 Bulk Import from Excel
              </Button>
            )}
            {canEdit && (
            <Dialog
              open={!!draft}
              onOpenChange={(o) => setDraft(o ? (draft ?? blank(currentStore.id)) : null)}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setDraft(blank(currentStore.id))}>
                  <Plus className="size-4" /> New product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{draft?.name ? "Edit product" : "New product"}</DialogTitle>
                </DialogHeader>
                {draft && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name" className="col-span-2">
                      <Input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </Field>
                    <Field label="SKU">
                      <Input
                        value={draft.sku}
                        onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                      />
                    </Field>
                    <Field label="Barcode">
                      <Input
                        value={draft.barcode}
                        onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                      />
                    </Field>
                    <Field label="Category">
                      <Input
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      />
                    </Field>
                    <Field label="Tax rate %">
                      <Input
                        className="numeric"
                        value={draft.taxRate * 100}
                        onChange={(e) =>
                          setDraft({ ...draft, taxRate: (Number(e.target.value) || 0) / 100 })
                        }
                      />
                    </Field>
                    <Field label="Price">
                      <Input
                        className="numeric"
                        value={draft.price}
                        onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="E-com price">
                      <Input
                        className="numeric"
                        value={draft.ecomPrice ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, ecomPrice: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                    <Field label="Cost">
                      <Input
                        className="numeric"
                        value={draft.cost}
                        onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label={`Stock · ${currentStore.code}`}>
                      <Input
                        className="numeric"
                        value={stockAt(draft, currentStore.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            stockByStore: {
                              ...draft.stockByStore,
                              [currentStore.id]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Reorder level">
                      <Input
                        className="numeric"
                        value={draft.reorderLevel}
                        onChange={(e) =>
                          setDraft({ ...draft, reorderLevel: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    onClick={() => {
                      if (!draft?.name.trim()) {
                        toast.error("Product name is required");
                        return;
                      }
                      upsertProduct(draft);
                      setDraft(null);
                      toast.success("Product saved");
                    }}
                  >
                    Save product
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </header>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
            <p className="text-sm">
              <span className="numeric font-semibold">{selected.length}</span> product
              {selected.length > 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={() => goToTransfers("request")}>
                <Inbox className="size-4" /> Request selected
              </Button>
              <Button size="sm" onClick={() => goToTransfers("transfer")}>
                <ArrowLeftRight className="size-4" /> Transfer selected
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allShownSelected}
                    onCheckedChange={(v) =>
                      setSelected(v ? rows.map((p) => p.id) : [])
                    }
                    aria-label="Select all products"
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                {showMoney && <TableHead className="text-right">Cost</TableHead>}
                <TableHead className="text-right">Price</TableHead>
                {showMoney && <TableHead className="text-right">Margin</TableHead>}
                {canEcom && <TableHead className="text-center">On web</TableHead>}
                <TableHead className="text-center">Stock · {currentStore.code}</TableHead>
                <TableHead className="text-center">Other stores</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(p.id)}
                      onCheckedChange={(v) => toggle(p.id, !!v)}
                      aria-label={`Select ${p.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-left font-medium hover:text-primary"
                      onClick={() => setDraft(p)}
                    >
                      {p.name}
                    </button>
                    <div className="numeric text-[11px] text-muted-foreground">
                      {p.sku} · {p.barcode}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.category}</TableCell>
                  {showMoney && (
                    <TableCell className="numeric text-right">{money(p.cost)}</TableCell>
                  )}
                  <TableCell className="numeric text-right">{money(p.price)}</TableCell>
                  {showMoney && (
                    <TableCell className="numeric text-right text-accent">
                      {p.price ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : "—"}
                    </TableCell>
                  )}
                  {canEcom && (
                    <TableCell className="text-center">
                      <Switch
                        checked={!!p.ecomVisible}
                        onCheckedChange={(v) => {
                          upsertProduct({ ...p, ecomVisible: v });
                          toast.success(
                            `${p.name} ${v ? "published to" : "hidden from"} the web store`,
                          );
                        }}
                        aria-label={`E-commerce visibility for ${p.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="outline" className="size-7" onClick={() => adjustStock(p.id, -1)}>
                        <Minus className="size-3" />
                      </Button>
                      <Badge
                        variant="outline"
                        className={`numeric w-12 justify-center ${
                          stockAt(p, currentStore.id) <= p.reorderLevel
                            ? "border-warning/50 text-warning"
                            : ""
                        }`}
                      >
                        {stockAt(p, currentStore.id)}
                      </Badge>
                      <Button size="icon" variant="outline" className="size-7" onClick={() => adjustStock(p.id, 1)}>
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-center gap-1">
                      {stores
                        .filter((s) => s.id !== currentStore.id)
                        .map((s) => (
                          <span
                            key={s.id}
                            className="numeric rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {s.code} {stockAt(p, s.id)}
                          </span>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        removeProduct(p.id);
                        toast.success("Product removed");
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {canEdit && <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </AppShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}