import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ClipboardCheck,
  Combine,
  FileSpreadsheet,
  Inbox,
  Minus,
  Plus,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
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
import { productVisibleAt } from "@/lib/branch-policy";
import { TablePagination, usePagination } from "@/components/pos/TablePagination";
import { Switch } from "@/components/ui/switch";
import { BulkImportDialog } from "@/components/pos/BulkImportDialog";
import { MergeProductsDialog } from "@/components/pos/MergeProductsDialog";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { exportProductsXlsx } from "@/lib/product-export";
import { subCategoriesOf, topCategories, useCategories, useUnits } from "@/lib/catalog-meta";
import { codeTakenBy } from "@/lib/product-lookup";
import { StockAdjustDialog, StockCountDialog } from "@/components/pos/StockAdjust";
import type { Product } from "@/lib/pos-types";
import { nextSku, peekSku, readSkuSettings } from "@/lib/sku";

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
  const {
    state,
    stores,
    currentStore,
    upsertProduct,
    removeProduct,
    removeProducts,
    patchProducts,
    adjustStock,
  } = usePos();
  const { can } = useAuth();
  const showMoney = can("can_view_sales_reports");
  const canEdit = can("can_add_new_product");
  const canPrice = can("can_edit_product_price");
  const canAdjust = can("can_adjust_stock");
  const canBulk = can("can_bulk_edit_products");
  const canMerge = can("can_merge_products");
  const canEcom = canPrice;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [bulkCategory, setBulkCategory] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [countOpen, setCountOpen] = useState(false);
  const [skuOverride, setSkuOverride] = useState(false);
  const autoSku = readSkuSettings().mode === "auto";
  const categories = useCategories();
  const units = useUnits();

  // Categories the catalogue actually uses, plus anything set up in settings.
  const categoryNames = useMemo(() => {
    const names = new Set<string>(topCategories(categories).map((c) => c.name));
    state.products.forEach((p) => p.category && names.add(p.category));
    return [...names].sort();
  }, [categories, state.products]);

  const subNames = useMemo(() => {
    if (catFilter === "all") return [];
    const names = new Set<string>(subCategoriesOf(categories, catFilter).map((c) => c.name));
    state.products
      .filter((p) => p.category === catFilter && p.subCategory)
      .forEach((p) => names.add(p.subCategory!));
    return [...names].sort();
  }, [categories, state.products, catFilter]);

  const rows = state.products.filter(
    (p) =>
      // Items owned by a private-catalogue branch stay at that branch.
      productVisibleAt(state.settings, p.id, state.currentStoreId) &&
      (catFilter === "all" || p.category === catFilter) &&
      (subFilter === "all" || (p.subCategory ?? "") === subFilter) &&
      `${p.name} ${p.sku} ${p.barcode} ${(p.barcodes ?? []).join(" ")} ${p.category} ${p.subCategory ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedProducts = state.products.filter((p) => selected.includes(p.id));
  const pager = usePagination(rows, 25);
  const pageRows = pager.pageItems;
  const allShownSelected =
    pageRows.length > 0 && pageRows.every((p) => selected.includes(p.id));

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
            {canAdjust && (
              <Button variant="outline" onClick={() => setCountOpen(true)}>
                <ClipboardCheck className="size-4" /> Stock check
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
                        readOnly={autoSku && !skuOverride}
                        placeholder={autoSku ? peekSku(state.products.map((p) => p.sku)) : ""}
                        onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                      />
                      {autoSku && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-muted-foreground underline"
                          onClick={() => setSkuOverride((v) => !v)}
                        >
                          {skuOverride ? "Use automatic number" : "Override this code"}
                        </button>
                      )}
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
                        disabled={!canPrice}
                        className="numeric"
                        value={draft.price}
                        onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="E-com price">
                      <Input
                        disabled={!canPrice}
                        className="numeric"
                        value={draft.ecomPrice ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, ecomPrice: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                    <Field label="Cost">
                      <Input
                        disabled={!canPrice}
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
                      const sku =
                        draft.sku.trim() ||
                        (autoSku ? nextSku(state.products.map((p) => p.sku)) : "");
                      upsertProduct({ ...draft, sku });
                      setDraft(null);
                      setSkuOverride(false);
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
                      setSelected(v ? pageRows.map((p) => p.id) : [])
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
              {pageRows.map((p) => (
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
                      {canAdjust && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Adjust / recount stock"
                          aria-label={`Adjust stock for ${p.name}`}
                          onClick={() => setAdjustTarget(p)}
                        >
                          <Scale className="size-3.5" />
                        </Button>
                      )}
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
          <TablePagination
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            from={pager.from}
            to={pager.to}
            label="items"
            onPage={pager.setPage}
            onPageSize={pager.setPageSize}
          />
        </div>
      </div>
      {canEdit && <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />}
      {canAdjust && (
        <>
          <StockAdjustDialog
            product={adjustTarget}
            storeId={currentStore.id}
            onClose={() => setAdjustTarget(null)}
          />
          <StockCountDialog
            open={countOpen}
            products={rows}
            storeId={currentStore.id}
            onClose={() => setCountOpen(false)}
          />
        </>
      )}
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