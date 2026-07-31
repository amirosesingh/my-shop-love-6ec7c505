import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
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
import { money, usePos } from "@/lib/pos-store";
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

const blank = (): Product => ({
  id: crypto.randomUUID(),
  name: "",
  sku: "",
  barcode: "",
  category: "General",
  price: 0,
  cost: 0,
  stock: 0,
  reorderLevel: 10,
  taxRate: 0.05,
});

function Inventory() {
  const { state, upsertProduct, removeProduct, adjustStock } = usePos();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);

  const rows = state.products.filter((p) =>
    `${p.name} ${p.sku} ${p.barcode} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const lowStock = state.products.filter((p) => p.stock <= p.reorderLevel);
  const stockValue = state.products.reduce((a, p) => a + p.cost * p.stock, 0);

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Inventory</h1>
            <p className="text-sm text-muted-foreground">
              {state.products.length} products · stock value{" "}
              <span className="numeric">{money(stockValue)}</span> ·{" "}
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
            <Dialog
              open={!!draft}
              onOpenChange={(o) => setDraft(o ? (draft ?? blank()) : null)}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setDraft(blank())}>
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
                    <Field label="Cost">
                      <Input
                        className="numeric"
                        value={draft.cost}
                        onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Stock">
                      <Input
                        className="numeric"
                        value={draft.stock}
                        onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) || 0 })}
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
          </div>
        </header>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
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
                  <TableCell className="numeric text-right">{money(p.cost)}</TableCell>
                  <TableCell className="numeric text-right">{money(p.price)}</TableCell>
                  <TableCell className="numeric text-right text-accent">
                    {p.price ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="outline" className="size-7" onClick={() => adjustStock(p.id, -1)}>
                        <Minus className="size-3" />
                      </Button>
                      <Badge
                        variant="outline"
                        className={`numeric w-12 justify-center ${
                          p.stock <= p.reorderLevel ? "border-warning/50 text-warning" : ""
                        }`}
                      >
                        {p.stock}
                      </Badge>
                      <Button size="icon" variant="outline" className="size-7" onClick={() => adjustStock(p.id, 1)}>
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
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