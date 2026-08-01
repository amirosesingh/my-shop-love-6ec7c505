import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, PackagePlus, ScanBarcode, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { logger } from "@/lib/audit-log";
import type { Product } from "@/lib/pos-types";

export const Route = createFileRoute("/purchasing")({
  head: () => ({
    meta: [
      { title: "Receiving Orders & Stock Entry — Northwind POS" },
      {
        name: "description",
        content:
          "Scan supplier invoices line by line, edit cost and quantity received, create missing items inline and post stock into the branch.",
      },
      { property: "og:title", content: "Receiving Orders & Stock Entry — Northwind POS" },
      {
        property: "og:description",
        content: "Barcode-driven receiving invoices with inline product creation and audit trail.",
      },
    ],
  }),
  component: Purchasing,
});

type Line = {
  id: string;
  productId: string;
  barcode: string;
  name: string;
  cost: number;
  price: number;
  qty: number;
};

type InvoiceLog = {
  id: string;
  invoiceNo: string;
  supplier: string;
  invoiceDate: string;
  uniqueItems: number;
  totalUnits: number;
  totalCost: number;
  at: string;
  operator: string;
  storeCode: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function Purchasing() {
  const { state, currentStore, upsertProduct, adjustStock } = usePos();
  const { can, user } = useAuth();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [scan, setScan] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [history, setHistory] = useState<InvoiceLog[]>([]);
  const [draft, setDraft] = useState<Product | null>(null);
  const [draftQty, setDraftQty] = useState("1");
  const scanRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(
    () => ({
      units: lines.reduce((a, l) => a + l.qty, 0),
      cost: Number(lines.reduce((a, l) => a + l.cost * l.qty, 0).toFixed(2)),
    }),
    [lines],
  );

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  if (!can("products")) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Permission required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your profile does not have “Can Create New Products / Access PO Engine”.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const findProduct = (code: string) =>
    state.products.find(
      (p) => p.barcode === code.trim() || p.sku.toLowerCase() === code.trim().toLowerCase(),
    );

  const patch = (id: string, next: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...next } : l)));

  const addLine = (p: Product, qty = 1) =>
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === p.id);
      if (existing)
        return ls.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + qty } : l));
      return [
        ...ls,
        {
          id: crypto.randomUUID(),
          productId: p.id,
          barcode: p.barcode,
          name: p.name,
          cost: p.cost,
          price: p.price,
          qty,
        },
      ];
    });

  function submitScan() {
    const code = scan.trim();
    if (!code) return;
    const hit = findProduct(code);
    setScan("");
    if (hit) {
      addLine(hit);
      logger.log("inventory_edit", "Receiving line scanned", "purchasing", {
        barcode: code,
        productId: hit.id,
        name: hit.name,
        matched: true,
      });
      toast.success(`${hit.name} added to invoice`);
      return;
    }
    logger.log("inventory_edit", "Unknown barcode scanned", "purchasing", {
      barcode: code,
      matched: false,
    });
    setDraftQty("1");
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      sku: code,
      barcode: code,
      category: "General",
      price: 0,
      cost: 0,
      ecomPrice: 0,
      ecomVisible: false,
      stockByStore: Object.fromEntries(state.stores.map((s) => [s.id, 0])),
      reorderLevel: 10,
      taxRate: 0.05,
    });
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Item name is required");
    if (!draft.price) return toast.error("Selling price is required");
    const qty = Math.max(1, Number(draftQty) || 1);
    upsertProduct({ ...draft, ecomPrice: draft.ecomPrice || draft.price });
    addLine(draft, qty);
    toast.success(`“${draft.name}” created and added to the invoice`);
    setDraft(null);
    scanRef.current?.focus();
  }

  function finalize() {
    const ref = invoiceNo.trim();
    if (!ref) return toast.error("Invoice number is required");
    if (!supplier.trim()) return toast.error("Supplier name is required");
    if (!lines.length) return toast.error("Scan at least one item into the invoice");

    const movements = lines.map((l) => {
      const before = state.products.find((p) => p.id === l.productId);
      const previousStock = before ? stockAt(before, currentStore.id) : 0;
      adjustStock(l.productId, l.qty, currentStore.id);
      // Cost changes captured on the line are written back to the catalog.
      if (before && before.cost !== l.cost) upsertProduct({ ...before, cost: l.cost });
      return {
        productId: l.productId,
        barcode: l.barcode,
        name: l.name,
        qty: l.qty,
        unitCost: l.cost,
        lineCost: Number((l.cost * l.qty).toFixed(2)),
        previousStock,
        updatedStock: previousStock + l.qty,
        storeId: currentStore.id,
      };
    });

    const record: InvoiceLog = {
      id: crypto.randomUUID(),
      invoiceNo: ref,
      supplier: supplier.trim(),
      invoiceDate,
      uniqueItems: lines.length,
      totalUnits: totals.units,
      totalCost: totals.cost,
      at: new Date().toISOString(),
      operator: user?.name ?? "—",
      storeCode: currentStore.code,
    };
    setHistory((h) => [record, ...h]);

    logger.log("inventory_edit", "Receiving order finalized", "purchasing", {
      ...record,
      stockMovements: movements,
    });

    toast.success(`Invoice ${ref} received · ${totals.units} units · ${money(totals.cost)}`);
    setInvoiceNo("");
    setSupplier("");
    setInvoiceDate(today());
    setLines([]);
    scanRef.current?.focus();
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Receiving order &amp; stock entry</h1>
          <p className="text-sm text-muted-foreground">
            Receiving into {currentStore.name} · operator {user?.name}
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Invoice number *</Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-2026-0417"
                className="numeric h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Supplier name *</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Harbour Foods Ltd"
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Invoice date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="numeric h-11"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Scan or search barcode</Label>
            <div className="flex gap-2">
              <Input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitScan()}
                placeholder="Scan a barcode and press Enter"
                className="numeric h-11 max-w-md"
              />
              <Button className="h-11" onClick={submitScan}>
                <ScanBarcode className="size-4" /> Add to invoice
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barcode</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="w-32 text-right">Cost price</TableHead>
                <TableHead className="text-right">Selling price</TableHead>
                <TableHead className="w-28 text-right">Qty received</TableHead>
                <TableHead className="text-right">Subtotal cost</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="numeric">{l.barcode}</TableCell>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="numeric h-9 text-right"
                      value={l.cost}
                      onChange={(e) => patch(l.id, { cost: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell className="numeric text-right text-muted-foreground">
                    {money(l.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="numeric h-9 text-right"
                      value={l.qty}
                      onChange={(e) =>
                        patch(l.id, { qty: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </TableCell>
                  <TableCell className="numeric text-right font-medium">
                    {money(l.cost * l.qty)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line"
                      onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!lines.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Scan a barcode to start this receiving invoice.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="numeric font-semibold text-foreground">{lines.length}</span> unique
              items ·{" "}
              <span className="numeric font-semibold text-foreground">{totals.units}</span> units ·
              total cost{" "}
              <span className="numeric font-semibold text-foreground">{money(totals.cost)}</span>
            </div>
            <Button className="h-11" onClick={finalize}>
              <PackagePlus className="size-4" /> Finalize &amp; receive stock
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Invoices received history</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice no.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice date</TableHead>
                <TableHead className="text-right">Unique items</TableHead>
                <TableHead className="text-right">Total units</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead className="text-right">Branch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="numeric font-medium">{h.invoiceNo}</TableCell>
                  <TableCell>{h.supplier}</TableCell>
                  <TableCell className="numeric text-muted-foreground">{h.invoiceDate}</TableCell>
                  <TableCell className="numeric text-right">{h.uniqueItems}</TableCell>
                  <TableCell className="numeric text-right">{h.totalUnits}</TableCell>
                  <TableCell className="numeric text-right">{money(h.totalCost)}</TableCell>
                  <TableCell>{h.operator}</TableCell>
                  <TableCell className="numeric text-right text-muted-foreground">
                    {h.storeCode}
                  </TableCell>
                </TableRow>
              ))}
              {!history.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No invoices received yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <FilePlus2 className="size-4" /> Add new item to inventory
              </span>
            </DialogTitle>
            <DialogDescription>
              Barcode {draft?.barcode} is not in the catalog. Saving creates the product and adds it
              to this invoice in one step.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3">
              <Field label="Barcode / SKU">
                <Input
                  className="numeric"
                  value={draft.barcode}
                  onChange={(e) =>
                    setDraft({ ...draft, barcode: e.target.value, sku: e.target.value })
                  }
                />
              </Field>
              <Field label="Item name *">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cost price">
                  <Input
                    className="numeric"
                    value={draft.cost}
                    onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Selling price *">
                  <Input
                    className="numeric"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Initial quantity received">
                  <Input
                    className="numeric"
                    value={draftQty}
                    onChange={(e) => setDraftQty(e.target.value)}
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDraft}>Save &amp; add to invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
